import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { clientId, status, firmId } = await req.json();

        // 1. Get Client Info (GHL Contact ID)
        const { data: client, error: clientError } = await supabaseClient
            .from('clients')
            .select('ghl_contact_id')
            .eq('client_id', clientId)
            .single();

        if (clientError || !client?.ghl_contact_id) {
            console.log("No linked GHL contact for client", clientId);
            return new Response(JSON.stringify({ message: "Skipped GHL sync (no contact ID)" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 2. Get Firm Info (GHL Credentials)
        // In a real app, we would decrypt the access token here
        // For now, we assume we might have a Location API Key or similar if using v1, 
        // or we need to implement the full token refresh flow.
        // This is a placeholder for the actual GHL API call.

        /*
        const response = await fetch(`https://services.leadconnectorhq.com/contacts/${client.ghl_contact_id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Version': '2021-07-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customFields: [
                    { id: 'custom_field_id_for_status', value: status }
                ]
            })
        });
        */

        console.log(`[Mock GHL Sync] Updating Contact ${client.ghl_contact_id} to status: ${status}`);

        return new Response(JSON.stringify({ message: "GHL Sync processed" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in crm-update:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
