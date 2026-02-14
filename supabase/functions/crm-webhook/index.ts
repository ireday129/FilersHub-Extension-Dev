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

        // DYNAMIC AUDIT LOGGING (via RPC)
        // Automatically creates columns for new payload fields
        let webhookLogId = null;
        let loggingError = null;
        try {
            const { data: logId, error: logError } = await supabaseClient.rpc('ingest_ghl_webhook', {
                payload: payload,
                firm_id: null
            });

            if (logId) webhookLogId = logId;
            if (logError) {
                console.error("Failed to log webhook (RPC):", logError);
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

        const INTERESTING_EVENTS = ['ContactCreate', 'ContactUpdate', 'INSTALL', 'UserCreate', 'UserUpdate', 'UserDelete'];

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

            // 5. UPDATE "users" Table (Exact GHL Mapping for Install User)
            if (typeof ghlUser !== 'undefined') {
                const installUserPayload = {
                    id: userId,
                    email: ghlUser.email,
                    firstName: ghlUser.firstName,
                    lastName: ghlUser.lastName,
                    name: ghlUser.name || `${ghlUser.firstName} ${ghlUser.lastName}`,
                    phone: ghlUser.phone,
                    extension: ghlUser.extension,
                    dob: ghlUser.dob,
                    city: ghlUser.city,
                    state: ghlUser.state,
                    country: ghlUser.country,
                    zip: ghlUser.zip,
                    address: ghlUser.address,
                    locationId: locationId,
                    roles: { type: 'firmowner' }, // Force Firm Owner Role for Installer
                    permissions: ghlUser.permissions,
                    companyId: ghlUser.companyId
                };

                // Remove undefined keys
                Object.keys(installUserPayload).forEach(key => installUserPayload[key] === undefined && delete installUserPayload[key]);

                const { error: userTableError } = await supabaseClient
                    .from('users')
                    .upsert(installUserPayload);

                if (userTableError) console.error("Failed to sync Install User to 'users':", userTableError);
            }

            // Update Log to Processed
            if (webhookLogId) {
                await supabaseClient.from('ghl_webhooks').update({
                    processed: true,
                    firm_id: firmId
                }).eq('record_id', webhookLogId);
            }

            return new Response(JSON.stringify({ message: "Install processed: User checked/created" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Handle USER Sync
        if (type === 'UserCreate' || type === 'UserUpdate') {
            // 1. Extract User Info
            const userId = payload.id || payload.user_id;
            const email = payload.email;
            const firstName = payload.firstName || payload.first_name;
            const lastName = payload.lastName || payload.last_name;
            const name = `${firstName} ${lastName}`;
            const role = payload.role; // 'admin' or 'user' usually

            if (!email) {
                return new Response(JSON.stringify({ message: "User event without email" }), { status: 200 });
            }

            // 2. Resolve Firm
            // Firm lookup handled earlier (lines 95-107) -> `firm` object
            if (!firm) {
                console.warn("User sync failed: Firm not found for location", locationId);
                return new Response(JSON.stringify({ message: "Firm not found" }), { status: 200 });
            }

            // 3. Create/Get Auth User
            let userRecord;
            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
            const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: name }
            });

            if (createError) {
                // Check duplicate
                const { data: linkData } = await supabaseClient.auth.admin.generateLink({
                    type: 'magiclink',
                    email: email
                });
                if (linkData?.user) userRecord = linkData.user;
            } else {
                userRecord = newUser.user;
            }

            if (!userRecord) {
                throw new Error("Failed to resolve auth user for staff sync");
            }

            // 4. Upsert Staff
            const appRole = (role === 'admin' || role === 'owner') ? 'Firm Owner' : 'Tax Professional';
            // Default to TaxProfessional if just 'user'. Or map permissions?
            // Simple mapping for now.

            const { error: staffError } = await supabaseClient
                .from('staff')
                .upsert({
                    firm_id: firm.firm_id,
                    email: email,
                    full_name: name,
                    role: appRole,
                    auth_user_id: userRecord.id,
                    ghl_user_id: userId,
                    ghl_location_id: locationId,
                    invite_status: 'accepted',
                    is_active: true
                }, { onConflict: 'email' });

            if (staffError) throw staffError;

            // 5. UPDATE "users" Table (Exact GHL Mapping)
            const userPayload = {
                id: userId,
                email: email,
                firstName: firstName,
                lastName: lastName,
                name: name,
                phone: payload.phone,
                extension: payload.extension,
                dob: payload.dob,
                city: payload.city,
                state: payload.state,
                country: payload.country,
                zip: payload.zip,
                address: payload.address,
                locationId: locationId,
                roles: payload.roles,
                permissions: payload.permissions,
                companyId: payload.companyId
            };

            Object.keys(userPayload).forEach(key => userPayload[key] === undefined && delete userPayload[key]);

            const { error: userTableError } = await supabaseClient
                .from('users')
                .upsert(userPayload);

            if (userTableError) {
                console.error("Failed to sync GHL User to 'users' table:", userTableError);
            }

            // Update Log
            if (webhookLogId) {
                await supabaseClient.from('ghl_webhooks').update({
                    processed: true,
                    firm_id: firm.firm_id
                }).eq('record_id', webhookLogId);
            }

            return new Response(JSON.stringify({ message: "Staff & User synced successfully" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Handle CONTACT Sync (ContactCreate, ContactUpdate)
        if (type === 'ContactCreate' || type === 'ContactUpdate') {
            const contactId = payload.id;
            const email = payload.email || payload.contact_email;
            const firstName = payload.firstName || payload.first_name;
            const lastName = payload.lastName || payload.last_name;
            const phone = payload.phone || payload.contact_phone;

            // For now, minimal validation. If no email, we might skip or use phone?
            // Let's require email for Clients in FilersHub.
            if (!email) {
                console.warn("Contact sync skipped: No email provided in payload.");
                return new Response(JSON.stringify({ message: "Skipped: No email" }), { status: 200 });
            }

            const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email;

            // 1. Try to find existing client by GHL ID first (using camelCase column "contactId")
            let { data: existingClient } = await supabaseClient
                .from('clients')
                .select('client_id, "contactId"')
                .eq('firm_id', firm.firm_id)
                .eq('"contactId"', contactId)
                .maybeSingle();

            // 2. Fallback: Find by Email
            if (!existingClient) {
                const { data: clientByEmail } = await supabaseClient
                    .from('clients')
                    .select('client_id, "contactId"')
                    .eq('firm_id', firm.firm_id)
                    .eq('email', email)
                    .maybeSingle();

                if (clientByEmail) existingClient = clientByEmail;
            }

            let result;
            const timestamp = new Date().toISOString();

            if (existingClient) {
                // Update
                result = await supabaseClient
                    .from('clients')
                    .update({
                        "contactId": contactId, // Ensure ID is linked
                        "locationId": locationId,
                        // active: true, // Maybe reactivate?
                        full_name: fullName,
                        phone: phone,
                        "lastSyncedAt": timestamp,
                        updated_at: timestamp
                    })
                    .eq('client_id', existingClient.client_id);
            } else {
                // Insert New Client
                result = await supabaseClient
                    .from('clients')
                    .insert({
                        firm_id: firm.firm_id,
                        email: email,
                        full_name: fullName,
                        phone: phone,
                        "contactId": contactId,
                        "locationId": locationId,
                        tax_return_status: 'Waiting on Documents', // Default status?
                        "lastSyncedAt": timestamp,
                        created_at: timestamp,
                        updated_at: timestamp
                    });
            }

            if (result.error) {
                console.error("Error upserting client:", result.error);
                throw result.error;
            }

            // Update Webhook Log
            if (webhookLogId) {
                await supabaseClient.from('ghl_webhooks').update({
                    firm_id: firm.firm_id,
                    processed: true,
                    processed_at: timestamp
                }).eq('record_id', webhookLogId);
            }

            return new Response(JSON.stringify({ message: "Client processed successfully" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Catch-all for other unhandled types
        return new Response(JSON.stringify({ message: "Event type ignored by handler" }), { status: 200 });

    } catch (error) {
        console.error("Error processing webhook:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
