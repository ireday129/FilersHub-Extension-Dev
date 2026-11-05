// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firmGhl, syncContactStatus, GhlNotConnectedError } from "../_shared/ghl.ts";
import { statusTag } from "../_shared/ghl-core.ts";

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

        // SECURITY (Nov 2026): only signed-in, active staff of this firm may update its GHL contacts.
        // (The gateway JWT check also accepts the public anon key, so check the user here.)
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const { data: authData } = jwt ? await supabaseAdmin.auth.getUser(jwt) : { data: null };
        const caller = authData?.user;
        if (!caller) {
            return new Response(JSON.stringify({ error: 'Please sign in.' }),
                { status: 401, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } });
        }
        const { data: staffRow } = await supabaseAdmin
            .from('staff')
            .select('staff_id')
            .eq('auth_user_id', caller.id)
            .eq('firm_id', firmId)
            .eq('is_active', true)
            .maybeSingle();
        if (!staffRow) {
            return new Response(JSON.stringify({ error: 'You are not staff of this firm.' }),
                { status: 403, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } });
        }

        // 1. Get client's GHL contact ID (only clients of this firm)
        const { data: client, error: clientError } = await supabaseAdmin
            .from('clients')
            .select('ghl_contact_id')
            .eq('client_id', clientId)
            .eq('firm_id', firmId)
            .single();

        if (clientError || !client?.ghl_contact_id) {
            console.log('No linked GHL contact for client', clientId);
            return new Response(
                JSON.stringify({ message: 'Skipped GHL sync (no GHL contact linked)' }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        const contactId = client.ghl_contact_id;

        // 2. Firm custom field config
        const { data: firmConfig } = await supabaseAdmin
            .from('firms')
            .select('ghl_custom_field_group, ghl_custom_field_name')
            .eq('firm_id', firmId)
            .maybeSingle();

        const customFieldName = firmConfig?.ghl_custom_field_name || 'Return Status';

        // 3. Sync tag + custom field with the firm's private token
        try {
            await syncContactStatus(await firmGhl(supabaseAdmin, firmId), contactId, status, customFieldName);
        } catch (err) {
            if (err instanceof GhlNotConnectedError) {
                return new Response(
                    JSON.stringify({ skipped: true, message: err.message }),
                    { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                );
            }
            console.error('GHL sync failed:', err.message);
            return new Response(
                JSON.stringify({ error: err.message }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }, status: 502 }
            );
        }

        const newStatusTag = statusTag(status);
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
