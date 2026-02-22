// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function receives an alert payload from the VPS Polling Engine and
// forwards it to a specific GoHighLevel Inbound Webhook URL configured by the user.
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { firm_id, client_id, alert_data } = payload;

        // 1. Basic Validation
        if (!firm_id || !client_id || !alert_data) {
            return new Response(JSON.stringify({ error: 'Missing required payload fields' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 2. Fetch firm configuration for the GHL Webhook URL
        const { data: firm, error: firmError } = await supabase
            .from('firms')
            .select('ghl_alert_webhook_url')
            .eq('firm_id', firm_id)
            .single();

        if (firmError || !firm?.ghl_alert_webhook_url) {
            console.error(`No webhook URL configured for firm ${firm_id}`);
            return new Response(JSON.stringify({ error: 'Firm webhook URL not configured' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            });
        }

        // 3. Fetch client details to include in the payload
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('full_name, email, phone, ghl_contact_id')
            .eq('client_id', client_id)
            .single();

        if (clientError || !client) {
            console.error(`Client not found: ${client_id}`);
            return new Response(JSON.stringify({ error: 'Client not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            });
        }

        // 4. Construct the GHL Webhook Payload
        const webhookPayload = {
            contact_id: client.ghl_contact_id, // Important for GHL to link the event
            client_name: client.full_name,
            client_email: client.email,
            client_phone: client.phone,
            alert_type: 'IRS_TRANSCRIPT_CODE',
            code: alert_data.code,
            description: alert_data.description,
            date: alert_data.date,
            tax_year: alert_data.tax_year,
            timestamp: new Date().toISOString()
        };

        // 5. Fire to GHL
        console.log(`Firing webhook to ${firm.ghl_alert_webhook_url} for contact ${client.ghl_contact_id}`);
        const webhookResp = await fetch(firm.ghl_alert_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });

        if (!webhookResp.ok) {
            const errText = await webhookResp.text();
            console.error(`GHL webhook failed: ${webhookResp.status} ${errText}`);
            return new Response(JSON.stringify({ error: 'Upstream webhook failed' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 502,
            });
        }

        return new Response(JSON.stringify({ success: true, message: 'Alert forwarded to GHL' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Trigger Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
