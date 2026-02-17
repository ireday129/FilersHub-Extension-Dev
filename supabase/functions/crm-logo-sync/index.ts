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

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders });
    }

    try {
        // User-scoped client (for auth)
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization') } } }
        );

        // Admin client (for DB operations)
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Unauthorized — no active session');

        const { firmId, logoUrl } = await req.json();
        if (!firmId || !logoUrl) {
            return new Response(
                JSON.stringify({ error: 'firmId and logoUrl are required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Verify caller is Firm Owner
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('firm_id, role')
            .eq('auth_user_id', user.id)
            .eq('firm_id', firmId)
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffData || staffData.role !== 'Firm Owner') {
            throw new Error('Only firm owners can sync logos to CRM');
        }

        // 2. Verify Pro plan + get location ID
        const { data: firmData } = await supabaseAdmin
            .from('firms')
            .select('subscription_tier, ghl_location_id')
            .eq('firm_id', firmId)
            .single();

        if (!firmData) throw new Error('Firm not found');

        const tier = firmData.subscription_tier?.toLowerCase();
        const isPro = tier === 'pro' || tier === 'growth' || tier === 'enterprise';
        if (!isPro) {
            return new Response(
                JSON.stringify({ error: 'Logo sync to CRM is a Pro feature', code: 'PRO_REQUIRED' }),
                { status: 403, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!firmData.ghl_location_id) {
            throw new Error('Firm is not connected to a CRM location. Please connect GHL in Settings.');
        }

        const locationId = firmData.ghl_location_id;

        // Strip cache-busting param for a clean URL
        const cleanLogoUrl = logoUrl.split('?')[0];

        // 3. Primary path: PUT /locations/{locationId} with agency API key
        const agencyApiKey = Deno.env.get('GHL_AGENCY_API_KEY');
        if (!agencyApiKey) {
            throw new Error('Agency API key not configured. Contact support.');
        }

        const putResp = await fetch(`${GHL_API_BASE}/locations/${locationId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${agencyApiKey}`,
                'Version': GHL_API_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ logoUrl: cleanLogoUrl }),
        });

        if (putResp.ok) {
            console.log(`Logo synced to GHL location ${locationId} via PUT /locations`);
            return new Response(
                JSON.stringify({
                    success: true,
                    method: 'location_update',
                    message: 'Logo synced to CRM location',
                }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Fallback: Upload to GHL Media Library + set as Custom Value
        console.warn(`PUT /locations failed (${putResp.status}), trying media upload fallback...`);
        const putError = await putResp.text();
        console.warn('PUT error detail:', putError);

        // Get sub-account OAuth token for media upload
        const { accessToken } = await getValidToken(supabaseAdmin, firmId);

        // 4a. Download logo from Supabase Storage
        const logoResp = await fetch(cleanLogoUrl);
        if (!logoResp.ok) throw new Error('Failed to fetch logo from storage');
        const logoBlob = await logoResp.blob();

        // 4b. Upload to GHL Media Library
        const formData = new FormData();
        formData.append('file', logoBlob, 'firm-logo.png');
        formData.append('name', 'FilersHub Firm Logo');

        const mediaResp = await fetch(
            `${GHL_API_BASE}/medias/upload-file?locationId=${locationId}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Version': GHL_API_VERSION,
                },
                body: formData,
            }
        );

        let mediaUrl = cleanLogoUrl;
        if (mediaResp.ok) {
            const mediaData = await mediaResp.json();
            mediaUrl = mediaData.url || mediaData.fileUrl || cleanLogoUrl;
            console.log('Logo uploaded to GHL media library:', mediaUrl);
        } else {
            console.warn('Media upload failed:', mediaResp.status, await mediaResp.text());
        }

        // 4c. Store logo URL as a Custom Value
        // First check if the custom value already exists
        const listResp = await fetch(
            `${GHL_API_BASE}/locations/${locationId}/customValues`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Version': GHL_API_VERSION,
                },
            }
        );

        let existingValueId = null;
        if (listResp.ok) {
            const listData = await listResp.json();
            const existing = (listData.customValues || []).find(
                (cv) => cv.name === 'firm_logo_url'
            );
            if (existing) existingValueId = existing.id;
        }

        if (existingValueId) {
            // Update existing custom value
            await fetch(
                `${GHL_API_BASE}/locations/${locationId}/customValues/${existingValueId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Version': GHL_API_VERSION,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: 'firm_logo_url', value: mediaUrl }),
                }
            );
        } else {
            // Create new custom value
            await fetch(
                `${GHL_API_BASE}/locations/${locationId}/customValues`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Version': GHL_API_VERSION,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: 'firm_logo_url', value: mediaUrl }),
                }
            );
        }

        console.log('Logo URL stored as custom value for location', locationId);

        return new Response(
            JSON.stringify({
                success: true,
                method: 'media_upload_fallback',
                message: 'Logo uploaded to CRM media library and stored as custom value',
                mediaUrl,
            }),
            { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('crm-logo-sync error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
