// @ts-nocheck
// Setup type definitions for Deno environment
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const payload = await req.json();
        console.log("Received GHL Webhook:", JSON.stringify(payload));

        const { locationId, type } = payload;

        // Only process ContactCreate or ContactUpdate for now
        // GHL payloads can vary, but usually have 'type' or implied by structure
        // We assume standard Contact Create/Update webhook

        // 1. Find the firm corresponding to this GHL Location ID
        const { data: firm, error: firmError } = await supabaseClient
            .from('firms')
            .select('firm_id')
            .eq('ghl_location_id', locationId)
            .single();

        if (firmError || !firm) {
            console.error("Firm not found for location:", locationId);
            return new Response(JSON.stringify({ error: "Firm not found" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            });
        }

        // 2. Extract Contact Info
        const contactId = payload.id;
        const email = payload.email || payload.contact_email;
        const firstName = payload.firstName || payload.first_name;
        const lastName = payload.lastName || payload.last_name;
        const phone = payload.phone || payload.contact_phone;

        if (!email) {
            console.error("No email in payload, skipping");
            return new Response(JSON.stringify({ message: "No email provided" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, // Return 200 to acknowledge receipt even if skipped
            });
        }

        const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email;

        // 3. Upsert Client
        // We try to find existing client by email + firm_id
        const { data: existingClient } = await supabaseClient
            .from('clients')
            .select('client_id')
            .eq('firm_id', firm.firm_id)
            .eq('email', email)
            .single();

        let result;
        if (existingClient) {
            // Update
            result = await supabaseClient
                .from('clients')
                .update({
                    ghl_contact_id: contactId,
                    full_name: fullName,
                    phone: phone,
                    updated_at: new Date().toISOString()
                })
                .eq('client_id', existingClient.client_id);
        } else {
            // Insert
            result = await supabaseClient
                .from('clients')
                .insert({
                    firm_id: firm.firm_id,
                    email: email,
                    full_name: fullName,
                    phone: phone,
                    ghl_contact_id: contactId,
                    tax_return_status: 'Waiting on Documents'
                });
        }

        if (result.error) {
            throw result.error;
        }

        // 4. Log Webhook in ghl_webhooks table for audit
        await supabaseClient.from('ghl_webhooks').insert({
            firm_id: firm.firm_id,
            event_type: type || 'ContactWebHook',
            payload: payload,
            processed: true,
            processed_at: new Date().toISOString()
        });

        return new Response(JSON.stringify({ message: "Client processed successfully" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error processing webhook:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
