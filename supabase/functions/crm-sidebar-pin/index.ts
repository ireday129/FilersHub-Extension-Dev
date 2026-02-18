// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'chrome-extension://',
];

function getCorsOrigin(req: Request): string {
    const origin = req.headers.get('origin') || '';
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) return origin;
    if (origin.includes('gohighlevel.com') || origin.includes('leadconnectorhq.com')) return origin;
    return ALLOWED_ORIGINS[0];
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

async function getValidToken(supabase, firmId) {
    const { data: integData, error } = await supabase
        .from('integrations_ghl')
        .select('access_token, refresh_token, token_expires_at, location_id')
        .eq('firm_id', firmId)
        .maybeSingle();

    if (error) throw new Error(`Token lookup failed: ${error.message}`);
    if (!integData?.access_token) throw new Error('No GHL access token found. Please connect GHL in Settings.');
    if (!integData.location_id) throw new Error('No GHL location ID found. Please reconnect GHL.');

    let accessToken = integData.access_token;

    if (integData.token_expires_at && new Date(integData.token_expires_at) < new Date()) {
        console.log('Token expired, refreshing...');
        const refreshResp = await fetch(`${GHL_API_BASE}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: Deno.env.get('GHL_CLIENT_ID'),
                client_secret: Deno.env.get('GHL_CLIENT_SECRET'),
                grant_type: 'refresh_token',
                refresh_token: integData.refresh_token,
            }),
        });

        if (!refreshResp.ok) {
            const errText = await refreshResp.text();
            console.error('Token refresh failed:', refreshResp.status, errText);
            throw new Error('GHL token expired and refresh failed. Please reconnect the CRM integration.');
        }

        const refreshData = await refreshResp.json();
        accessToken = refreshData.access_token;
        const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

        await supabase.from('integrations_ghl').update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token,
            token_expires_at: newExpiry,
        }).eq('firm_id', firmId);

        console.log('Token refreshed successfully');
    }

    return { accessToken, locationId: integData.location_id };
}

// Helper: call GHL Custom Menu Links API with auth fallback
async function ghlCustomMenuRequest(method: string, path: string, body: any, agencyApiKey: string, oauthToken?: string) {
    const url = `${GHL_API_BASE}${path}`;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${agencyApiKey}`,
        'Version': GHL_API_VERSION,
        'Content-Type': 'application/json',
    };

    const opts: RequestInit = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    let resp = await fetch(url, opts);

    // If agency key fails, try OAuth token
    if (!resp.ok && oauthToken) {
        console.log(`Agency key failed (${resp.status}) for ${method} ${path}, trying OAuth token...`);
        headers['Authorization'] = `Bearer ${oauthToken}`;
        opts.headers = headers;
        resp = await fetch(url, opts);
    }

    return resp;
}

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization') } } }
        );

        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Unauthorized — no active session');

        const { firmId, action } = await req.json();
        if (!firmId) {
            return new Response(
                JSON.stringify({ error: 'firmId is required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!action || !['pin', 'unpin'].includes(action)) {
            return new Response(
                JSON.stringify({ error: 'action must be "pin" or "unpin"' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify caller is Firm Owner
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('firm_id, role')
            .eq('auth_user_id', user.id)
            .eq('firm_id', firmId)
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffData || staffData.role !== 'Firm Owner') {
            throw new Error('Only firm owners can manage sidebar pinning');
        }

        // Fetch firm details
        const { data: firmData, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('ghl_location_id, subscription_tier, name')
            .eq('firm_id', firmId)
            .single();

        if (firmError) throw new Error(`Firm lookup failed: ${firmError.message}`);
        if (!firmData) throw new Error('Firm not found');

        // Check Pro tier
        const isPro = ['pro', 'growth', 'enterprise'].includes(firmData.subscription_tier?.toLowerCase());
        if (!isPro) {
            return new Response(
                JSON.stringify({ error: 'Sidebar pinning is available for Pro plans and above' }),
                { status: 403, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!firmData.ghl_location_id) {
            throw new Error('Firm is not connected to a CRM location. Please connect GHL in Settings.');
        }

        const locationId = firmData.ghl_location_id;
        const agencyApiKey = Deno.env.get('GHL_AGENCY_API_KEY');
        if (!agencyApiKey) throw new Error('Agency API key not configured. Contact support.');

        // Get OAuth token as fallback
        let oauthToken: string | undefined;
        try {
            const { accessToken } = await getValidToken(supabaseAdmin, firmId);
            oauthToken = accessToken;
        } catch (e) {
            console.log('OAuth token not available for fallback:', e.message);
        }

        if (action === 'pin') {
            // Idempotency: check if CML already exists
            const listResp = await ghlCustomMenuRequest('GET', '/custom-menus/', null, agencyApiKey, oauthToken);
            if (listResp.ok) {
                const listData = await listResp.json();
                const menus = listData.customMenus || listData.data || [];
                const existing = menus.find((m: any) =>
                    m.url?.includes('filershub.com/widget')
                );
                if (existing) {
                    return new Response(
                        JSON.stringify({ success: true, action: 'already_pinned', menuId: existing.id }),
                        { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }

            // Create CML — single agency-level link, GHL injects location_id + email dynamically
            const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';
            const cmlPayload = {
                name: 'FilersHub',
                url: `${appUrl}/widget?location_id={{location.id}}&email={{user.email}}`,
                openIn: 'iframe',
                showTo: 'all',
                showOnAllLocations: true,
            };

            console.log('Creating CML:', JSON.stringify(cmlPayload));
            const createResp = await ghlCustomMenuRequest('POST', '/custom-menus/', cmlPayload, agencyApiKey, oauthToken);

            if (!createResp.ok) {
                const errText = await createResp.text();
                console.error(`POST /custom-menus/ failed (${createResp.status}):`, errText);
                throw new Error(`Failed to create sidebar link (status ${createResp.status})`);
            }

            const createData = await createResp.json();
            console.log('CML created successfully:', createData.id || createData);

            return new Response(
                JSON.stringify({ success: true, action: 'pinned', menuId: createData.id }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'unpin') {
            // Find and delete existing CML
            const listResp = await ghlCustomMenuRequest('GET', '/custom-menus/', null, agencyApiKey, oauthToken);
            if (!listResp.ok) {
                throw new Error('Failed to list custom menu links');
            }

            const listData = await listResp.json();
            const menus = listData.customMenus || listData.data || [];
            const existing = menus.find((m: any) =>
                m.url?.includes('filershub.com/widget')
            );

            if (existing) {
                const deleteResp = await ghlCustomMenuRequest('DELETE', `/custom-menus/${existing.id}`, null, agencyApiKey, oauthToken);
                if (!deleteResp.ok) {
                    const errText = await deleteResp.text();
                    console.error(`DELETE /custom-menus/${existing.id} failed:`, errText);
                    throw new Error('Failed to remove sidebar link');
                }
            }

            return new Response(
                JSON.stringify({ success: true, action: 'unpinned' }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

    } catch (error) {
        console.error('crm-sidebar-pin error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
