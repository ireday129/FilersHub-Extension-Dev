import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { locationId, email } = req.body;

    if (!locationId) {
        return res.status(400).json({ error: 'Missing locationId' });
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

        // Layer 2 (SECURITY, Nov 2026): the caller must be signed in to FilersHub as an active
        // staff member of this firm. The email sent in the request is no longer trusted.
        const accessToken = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        const { data: authData } = accessToken
            ? await supabaseAdmin.auth.getUser(accessToken)
            : { data: { user: null } };
        if (!authData?.user) {
            return res.status(401).json({ error: 'Please sign in to FilersHub.', code: 'SIGN_IN_REQUIRED' });
        }
        const { data: staffMember, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('staff_id')
            .eq('firm_id', firm.firm_id)
            .eq('auth_user_id', authData.user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffMember) {
            return res.status(403).json({ error: 'Access denied', code: 'STAFF_NOT_FOUND' });
        }

        return res.status(200).json({ firm_id: firm.firm_id });
    } catch (err: any) {
        console.error('crm-validate-location error:', err);
        return res.status(500).json({ error: err.message || 'Validation failed' });
    }
}
