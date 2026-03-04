// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'https://dev.filershub.com',
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
const TAG_PREFIX = 'fh-status:';

async function getValidToken(supabase: any, firmId: string): Promise<{ accessToken: string; locationId: string }> {
    const { data: integData, error } = await supabase
        .from('integrations_ghl')
        .select('access_token, refresh_token, token_expires_at, location_id')
        .eq('firm_id', firmId)
        .maybeSingle();

    if (error) throw new Error(`Token lookup failed: ${error.message}`);
    if (!integData?.access_token) throw new Error('No GHL access token found. Please connect GHL in Settings.');
    if (!integData.location_id) throw new Error('No GHL location ID found. Please reconnect GHL.');

    let accessToken = integData.access_token;

    // Refresh if expired
    if (integData.token_expires_at && new Date(integData.token_expires_at) < new Date()) {
        console.log('Token expired, refreshing...');
        const refreshResp = await fetch(`${GHL_API_BASE}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: Deno.env.get('GHL_CLIENT_ID')!,
                client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
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
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { clientId, status, firmId } = await req.json();

        if (!clientId || !status || !firmId) {
            return new Response(
                JSON.stringify({ error: 'clientId, status, and firmId are required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Get client's GHL contact ID
        const { data: client, error: clientError } = await supabaseAdmin
            .from('clients')
            .select('ghl_contact_id')
            .eq('client_id', clientId)
            .single();

        if (clientError || !client?.ghl_contact_id) {
            console.log('No linked GHL contact for client', clientId);
            return new Response(
                JSON.stringify({ message: 'Skipped GHL sync (no GHL contact linked)' }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        const contactId = client.ghl_contact_id;

        // 2. Get valid GHL access token (refresh if expired)
        const { accessToken } = await getValidToken(supabaseAdmin, firmId);

        const ghlHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Version': GHL_API_VERSION,
            'Content-Type': 'application/json',
        };

        // 3. Fetch current contact to get existing tags
        const contactResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Version': GHL_API_VERSION },
        });

        if (!contactResp.ok) {
            const errText = await contactResp.text();
            console.error('Failed to fetch GHL contact:', contactResp.status, errText);
            if (contactResp.status === 401) {
                throw new Error('GHL authorization failed (401). Token may be expired.');
            }
            throw new Error(`GHL contact fetch failed (${contactResp.status}): ${errText}`);
        }

        const contactData = await contactResp.json();
        const existingTags: string[] = contactData.contact?.tags || [];

        // 4. Build new tags: remove old fh-status tags, add new one
        const newStatusTag = `${TAG_PREFIX}${status.toLowerCase().replace(/\s+/g, '-')}`;
        const updatedTags = existingTags.filter((t: string) => !t.startsWith(TAG_PREFIX));
        updatedTags.push(newStatusTag);

        // 5. Get firm custom field config
        const { data: firmConfig } = await supabaseAdmin
            .from('firms')
            .select('ghl_custom_field_group, ghl_custom_field_name')
            .eq('firm_id', firmId)
            .maybeSingle();

        const customFieldName = firmConfig?.ghl_custom_field_name || 'Return Status';

        // 6. Update contact: tags + custom field
        const updatePayload: Record<string, any> = {
            tags: updatedTags,
        };

        // Add custom field value if configured
        if (customFieldName) {
            updatePayload.customFields = [
                { key: customFieldName, field_value: status },
            ];
        }

        const updateResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(updatePayload),
        });

        if (!updateResp.ok) {
            const errText = await updateResp.text();
            console.error('Failed to update GHL contact:', updateResp.status, errText);
            throw new Error(`GHL contact update failed (${updateResp.status}): ${errText}`);
        }

        const updateResult = await updateResp.json();
        console.log(`GHL sync complete: contact=${contactId}, tag=${newStatusTag}, status=${status}`);

        return new Response(
            JSON.stringify({
                message: 'GHL sync complete',
                contactId,
                tag: newStatusTag,
                status,
            }),
            { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        console.error('crm-update error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
