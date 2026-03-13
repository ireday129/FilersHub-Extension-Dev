import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { locationId, email, updateId } = req.body;

    if (!locationId || !email || !updateId) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Layer 1: Resolve firm by locationId
        const { data: firm, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('firm_id')
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

        // Layer 3: Archive the update for this staff member
        const { error: archiveError } = await supabaseAdmin
            .from('staff_archived_updates')
            .insert({
                staff_id: staffMember.staff_id,
                update_id: updateId
            });

        // Ignore unique constraint violation if they already archived it
        if (archiveError && archiveError.code !== '23505') {
            throw new Error(`Archiving failed: ${archiveError.message}`);
        }

        return res.status(200).json({ success: true });
    } catch (err: any) {
        console.error('Archive update error:', err);
        return res.status(500).json({ error: err.message || 'Failed to archive update' });
    }
}
