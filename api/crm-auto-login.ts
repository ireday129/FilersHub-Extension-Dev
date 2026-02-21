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

        // Layer 1: Resolve firm by ghl_location_id
        const { data: firm, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('firm_id')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        if (firmError) throw new Error(`Firm lookup failed: ${firmError.message}`);
        if (!firm) {
            return res.status(403).json({ error: 'Access denied', code: 'LOCATION_NOT_FOUND' });
        }

        // Layer 2: Verify email is active staff for this firm
        const { data: staffMember, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('staff_id, email')
            .eq('firm_id', firm.firm_id)
            .ilike('email', email.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffMember) {
            return res.status(403).json({ error: 'Access denied', code: 'STAFF_NOT_FOUND' });
        }

        // Layer 3: Generate magic link token hash (no email sent)
        const { data: linkData, error: linkError } = await supabaseAdmin
            .auth.admin.generateLink({
                type: 'magiclink',
                email: staffMember.email,
            });

        if (linkError) throw new Error(`Token generation failed: ${linkError.message}`);

        const tokenHash = linkData?.properties?.hashed_token;
        if (!tokenHash) {
            throw new Error('No token hash returned');
        }

        return res.status(200).json({ token_hash: tokenHash });
    } catch (err: any) {
        console.error('crm-auto-login error:', err);
        return res.status(500).json({ error: err.message || 'Auto-login failed' });
    }
}
