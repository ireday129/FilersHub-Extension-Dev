import { createClient } from '@supabase/supabase-js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const agencyKey = process.env.GHL_AGENCY_API_KEY;

        if (!agencyKey) {
            // Fallback: get OAuth token from integrations_ghl
            const supabase = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            const { data, error } = await supabase
                .from('integrations_ghl')
                .select('access_token')
                .limit(1)
                .maybeSingle();

            if (error || !data?.access_token) {
                return res.status(500).json({ error: 'No GHL credentials available' });
            }

            const resp = await fetch(`${GHL_API_BASE}/custom-menus/`, {
                headers: {
                    'Authorization': `Bearer ${data.access_token}`,
                    'Version': GHL_API_VERSION,
                },
            });

            const result = await resp.json();
            return res.status(200).json(result);
        }

        const resp = await fetch(`${GHL_API_BASE}/custom-menus/`, {
            headers: {
                'Authorization': `Bearer ${agencyKey}`,
                'Version': GHL_API_VERSION,
            },
        });

        const result = await resp.json();
        return res.status(200).json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
