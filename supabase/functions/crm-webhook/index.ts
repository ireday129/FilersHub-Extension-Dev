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
        const { locationId: rawLocationId, location_id, type } = payload;
        const locationId = rawLocationId || location_id;

        // RAW AUDIT LOGGING (Log everything immediately)
        // We use a separate try/catch to ensure logging failure doesn't crash the webhook processing if mostly harmless
        let webhookLogId = null;
        let loggingError = null;
        try {
            const { data: logData, error: logError } = await supabaseClient.from('ghl_webhooks').insert({
                // Payload Mapping
                type: type,
                location_id: locationId,
                version_id: payload.versionId || payload.version_id,
                app_id: payload.appId || payload.app_id,

                install_type: payload.installType,
                company_id: payload.companyId || payload.company_id,
                user_id: payload.userId || payload.user_id,
                company_name: payload.companyName,
                is_whitelabel_company: payload.isWhitelabelCompany,

                contact_id: payload.id || payload.contact_id,
                first_name: payload.firstName || payload.first_name,
                last_name: payload.lastName || payload.last_name,
                email: payload.email || payload.contact_email,
                phone: payload.phone || payload.contact_phone,
                tags: payload.tags,
                country: payload.country,
                date_added: payload.dateAdded,

                payload_timestamp: payload.timestamp,
                webhook_id: payload.webhookId || payload.webhook_id,

                // System
                payload: payload,
                processed: false
            }).select('id').single();

            if (logData) webhookLogId = logData.id;
            if (logError) {
                console.error("Failed to log webhook:", logError);
                loggingError = logError.message;
            }
        } catch (logErr) {
            console.error("Webhook logging exception:", logErr);
            loggingError = logErr.message;
        }

        console.log(`Received Webhook: Type=${type}, Location=${locationId}, LogID=${webhookLogId}`);

        // MARKETPLACE SAFETY:
        // GHL Marketplace apps receive ALL events. We must filter for what we care about.
        // Returning 200 OK is crucial for ignored events so GHL doesn't disable the webhook.

        const INTERESTING_EVENTS = ['ContactCreate', 'ContactUpdate', 'INSTALL'];

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

        if (!firm && type !== 'INSTALL') {
            // MARKETPLACE SAFETY:
            // If we don't know this location, it might be an install we haven't onboarded yet,
            // or a disconnect. We should log it but return 200 to keep the webhook alive.
            // EXCEPTION: INSTALL events handle their own firm lookup/logic.
            console.warn(`Unknown location ID: ${locationId}. Skipping.`);
            return new Response(JSON.stringify({ message: "Location not registered" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Handle INSTALL event separately
        if (type === 'INSTALL') {
            const userId = payload.userId || payload.user_id;

            // 1. Get Access Token (Check both firms and integrations_ghl)
            let accessToken = null;
            let firmId = null;

            // Check firms table (Legacy/Install flow)
            const { data: firmData } = await supabaseClient
                .from('firms')
                .select('firm_id, ghl_access_token')
                .eq('ghl_location_id', locationId)
                .maybeSingle();

            if (firmData?.ghl_access_token) {
                accessToken = firmData.ghl_access_token;
                firmId = firmData.firm_id;
            } else {
                // Check integrations table (New flow)
                const { data: integData } = await supabaseClient
                    .from('integrations_ghl')
                    .select('access_token, firm_id')
                    .eq('location_id', locationId)
                    .maybeSingle();

                if (integData?.access_token) {
                    accessToken = integData.access_token;
                    firmId = integData.firm_id;
                }
            }

            if (!accessToken || !firmId) {
                console.warn("No access token found for location (Install race condition):", locationId);
                // Return 200 to prevent GHL from retrying endlessly if token never appears.
                // The user will be created via SSO when they first login.
                return new Response(JSON.stringify({
                    message: "Access token not found yet. Retrying via SSO.",
                    debug_log_error: loggingError
                }), { status: 200 });
            }

            // 2. Fetch User Details from GHL
            const userResp = await fetch(`https://services.leadconnectorhq.com/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Version': '2021-07-28'
                }
            });

            if (!userResp.ok) {
                const errText = await userResp.text();
                console.error("Failed to fetch user:", errText);
                return new Response(JSON.stringify({ error: "Failed to fetch user from GHL" }), { status: 500 });
            }

            const userData = await userResp.json();
            const ghlUser = userData.user || userData;

            const email = ghlUser.email;
            const name = `${ghlUser.firstName} ${ghlUser.lastName}`;

            if (!email) {
                return new Response(JSON.stringify({
                    message: "No email for user, skipping.",
                    debug_log_error: loggingError
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            // 3. Create/Get Supabase Auth User
            let userRecord;

            // Try creating user first
            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
            const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: name, role: 'Firm Owner' }
            });

            if (createError) {
                // If user exists, find them via generateLink (workaround for lack of getUserByEmail)
                // We check for common error messages or codes for duplicates
                const isDuplicate = createError.message?.toLowerCase().includes("already registered") ||
                    createError.message?.toLowerCase().includes("unique constraint") ||
                    createError.status === 400;

                if (isDuplicate) {
                    console.log("User exists, fetching details via generateLink...");
                    const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
                        type: 'magiclink',
                        email: email
                    });

                    if (linkError || !linkData.user) {
                        console.error("Failed to find existing user:", linkError);
                        throw new Error("User exists but could not override/find id");
                    }
                    userRecord = linkData.user;
                } else {
                    throw createError;
                }
            } else {
                userRecord = newUser.user;
                console.log("Created new auth user:", email);
            }

            if (!userRecord) throw new Error("Failed to resolve auth user");

            // 4. Create Staff Record (Firm Owner)
            const { error: staffError } = await supabaseClient
                .from('staff')
                .upsert({
                    firm_id: firmId,
                    email: email,
                    full_name: name,
                    role: 'Firm Owner',
                    auth_user_id: userRecord.id, // Link to Supabase Auth
                    ghl_user_id: userId,
                    ghl_location_id: locationId,
                    invite_status: 'accepted',
                    is_active: true
                }, { onConflict: 'email' });

            if (staffError) throw staffError;

            // Update Log to Processed
            if (webhookLogId) {
                await supabaseClient.from('ghl_webhooks').update({
                    processed: true,
                    firm_id: firmId
                }).eq('id', webhookLogId);
            }

            return new Response(JSON.stringify({ message: "Install processed: Owner created" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 2. Extract Contact Info (for standard events)
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

        // 3. Upsert Client (Standard Logic)
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

        // 4. Update Webhook Log
        if (webhookLogId) {
            await supabaseClient.from('ghl_webhooks').update({
                firm_id: firm.firm_id,
                processed: true,
                processed_at: new Date().toISOString()
            }).eq('id', webhookLogId);
        }

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
