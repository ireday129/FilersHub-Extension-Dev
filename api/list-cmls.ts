import { createClient } from '@supabase/supabase-js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Try agency key first
        const agencyKey = process.env.GHL_AGENCY_API_KEY;

        if (agencyKey) {
            const resp = await fetch(`${GHL_API_BASE}/custom-menus/`, {
                headers: {
                    'Authorization': `Bearer ${agencyKey}`,
                    'Version': GHL_API_VERSION,
                },
            });
            const result = await resp.json();
            return res.status(200).json(result);
        }

        // Fallback: get OAuth token from integrations_ghl
        const { data: integrations, error: integError } = await supabase
            .from('integrations_ghl')
            .select('access_token, refresh_token, token_expires_at, firm_id')
            .limit(5);

        if (integError) {
            return res.status(500).json({
                error: 'DB query failed',
                detail: integError.message,
                hasAgencyKey: !!agencyKey,
            });
        }

        if (!integrations || integrations.length === 0) {
            return res.status(500).json({
                error: 'No GHL integrations found in database',
                hasAgencyKey: !!agencyKey,
            });
        }

        // Try each token until one works
        for (const integ of integrations) {
            let token = integ.access_token;

            // Refresh if expired
            if (integ.token_expires_at && new Date(integ.token_expires_at) < new Date()) {
                try {
                    const refreshResp = await fetch(`${GHL_API_BASE}/oauth/token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: process.env.GHL_CLIENT_ID || process.env.VITE_GHL_CLIENT_ID || '',
                            client_secret: process.env.GHL_CLIENT_SECRET || process.env.VITE_GHL_CLIENT_SECRET || '',
                            grant_type: 'refresh_token',
                            refresh_token: integ.refresh_token,
                        }),
                    });
                    if (refreshResp.ok) {
                        const refreshData = await refreshResp.json();
                        token = refreshData.access_token;
                        // Update token in DB
                        await supabase.from('integrations_ghl').update({
                            access_token: refreshData.access_token,
                            refresh_token: refreshData.refresh_token,
                            token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
                        }).eq('firm_id', integ.firm_id);
                    }
                } catch (e) {
                    continue;
                }
            }

            const resp = await fetch(`${GHL_API_BASE}/custom-menus/`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': GHL_API_VERSION,
                },
            });

            if (resp.ok) {
                const result = await resp.json();
                return res.status(200).json(result);
            }
        }

        return res.status(500).json({ error: 'All tokens failed', count: integrations.length });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
