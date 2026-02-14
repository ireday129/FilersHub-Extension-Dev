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
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const payload = await req.json();
        const { locationId, type } = payload;

        console.log(`Received Webhook: Type=${type}, Location=${locationId}`);

        // MARKETPLACE SAFETY:
        // GHL Marketplace apps receive ALL events. We must filter for what we care about.
        // Returning 200 OK is crucial for ignored events so GHL doesn't disable the webhook.

        const INTERESTING_EVENTS = ['ContactCreate', 'ContactUpdate'];

        if (!INTERESTING_EVENTS.includes(type)) {
            console.log(`Ignoring event type: ${type}`);
            return new Response(JSON.stringify({ message: "Event ignored" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        if (!locationId) {
            console.log("No locationId in payload, ignoring.");
            return new Response(JSON.stringify({ message: "No locationId" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 1. Find the firm corresponding to this GHL Location ID
        const { data: firm, error: firmError } = await supabaseClient
            .from('firms')
            .select('firm_id')
            .eq('ghl_location_id', locationId)
            .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

        if (firmError) {
            console.error("Database error looking up firm:", firmError);
            return new Response(JSON.stringify({ error: "Database error" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        if (!firm) {
            // MARKETPLACE SAFETY:
            // If we don't know this location, it might be an install we haven't onboarded yet,
            // or a disconnect. We should log it but return 200 to keep the webhook alive.
            console.warn(`Unknown location ID: ${locationId}. Skipping.`);
            return new Response(JSON.stringify({ message: "Location not registered" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
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
                status: 200,
            });
        }

        const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email;

        // 3. Upsert Client
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
            console.error("Error upserting client:", result.error);
            throw result.error;
        }

        // 4. Log Webhook in ghl_webhooks table for audit
        // We log valuable events only to save space/noise
        await supabaseClient.from('ghl_webhooks').insert({
            firm_id: firm.firm_id,
            event_type: type,
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
