import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { locationId, email } = req.body;

    if (!locationId || !email) {
        return res.status(400).json({ error: 'Missing locationId or email' });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Layer 1: Resolve firm by locationId
        const { data: firm, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('firm_id, firm_name, subscription_tier')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        if (firmError) throw new Error(`Firm lookup failed: ${firmError.message}`);
        if (!firm) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const firmId = firm.firm_id;

        // Layer 2: Verify email is an active staff member for this firm
        const { data: staffMember, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('staff_id')
            .eq('firm_id', firmId)
            .ilike('email', email.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffMember) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Layer 3: Fetch stats + platform updates
        const [clientsResult, returnsResult, updatesResult] = await Promise.all([
            supabaseAdmin
                .from('clients')
                .select('client_id', { count: 'exact', head: true })
                .eq('firm_id', firmId),
            supabaseAdmin
                .from('tax_returns')
                .select('status')
                .eq('firm_id', firmId),
            supabaseAdmin
                .from('platform_updates')
                .select('update_id, type, title, body, created_at, is_pro')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(10),
            supabaseAdmin
                .from('staff_archived_updates')
                .select('update_id')
                .eq('staff_id', staffMember.staff_id)
        ]);

        const totalClients = clientsResult.count || 0;
        const returns = returnsResult.data || [];
        const totalReturns = returns.length;

        // Group returns by status
        const returnsByStatus: Record<string, number> = {};
        for (const r of returns) {
            const status = r.status || 'Unknown';
            returnsByStatus[status] = (returnsByStatus[status] || 0) + 1;
        }

        const archivedUpdates = new Set((updatesResult[3]?.data || []).map((au: any) => au.update_id));

        const platformUpdates = (updatesResult.data || [])
            .filter((u: any) => !archivedUpdates.has(u.update_id))
            .map((u: any) => ({
                id: u.update_id,
                type: u.type,
                title: u.title,
                body: u.body,
                date: u.created_at,
                isPro: u.is_pro || false,
            }));

        return res.status(200).json({
            firmName: firm.firm_name,
            subscriptionTier: firm.subscription_tier || 'Core',
            stats: {
                totalClients,
                totalReturns,
                returnsByStatus,
            },
            platformUpdates,
        });
    } catch (err: any) {
        console.error('Widget data error:', err);
        return res.status(500).json({ error: err.message || 'Failed to load widget data' });
    }
}
