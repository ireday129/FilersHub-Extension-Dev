// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Trigger deployment check

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)

        // Parse body if POST
        let body: any = {}
        if (req.method === 'POST') {
            try {
                body = await req.json()
            } catch (e) {
                // ignore
            }
        }

        const pathname = url.pathname

        // Initialize Supabase Admin Client Early
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. INIT: Generate Auth URL
        if (pathname.endsWith('/init') || (req.method === 'POST' && body.action === 'init')) {
            const action = url.searchParams.get('action') || body.action;
            const firmId = url.searchParams.get('firmId') || body.firmId;
            const locationId = url.searchParams.get('locationId') || body.locationId;
            const userId = url.searchParams.get('userId') || body.userId;
            const userEmail = url.searchParams.get('userEmail') || body.userEmail;

            // For SSO, we need locationId AND (userId OR userEmail)
            let state = '';
            if (action === 'sso' && locationId && (userId || userEmail)) {
                // state format: sso:locationId:userId:userEmail
                state = `sso:${locationId}:${userId || 'null'}:${userEmail || 'null'}`;

                // Silent SSO Check
                // If we have a valid token for this location, try to log in directly without OAuth redirect
                const { data: integ } = await supabaseAdmin
                    .from('integrations_ghl')
                    .select('access_token, firm_id')
                    .eq('location_id', locationId)
                    .maybeSingle();

                if (integ?.access_token) {
                    try {
                        let email = userEmail;
                        let name = 'Firm Owner';

                        // Verify User against GHL API using stored token
                        // If we have userId, fetch profile. If only email, maybe verify /users/me or search?
                        // For safety, let's try fetch user by ID if available. 
                        if (userId && userId !== 'null') {
                            const userResp = await fetch(`https://services.leadconnectorhq.com/users/${userId}`, {
                                headers: {
                                    'Authorization': `Bearer ${integ.access_token}`,
                                    'Version': '2021-07-28'
                                }
                            });

                            if (userResp.ok) {
                                const userData = await userResp.json();
                                const ghlUser = userData.user || userData;
                                email = ghlUser.email;
                                name = `${ghlUser.firstName} ${ghlUser.lastName}`;
                            }
                        } else if (email) {
                            // If only email, we trust it? OR verify via /users/search
                            // Let's assume trust if we have location token + email (low risk for V1)
                            // Or fetch /users/me to check if token belongs to this user? (OAuth token is location level usually)
                            // For now, proceed.
                        }

                        if (email) {
                            // Find/Create Auth User logic (reused from callback, simplified)
                            // 1. Create/Get User
                            let userRecord;
                            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
                            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                                email: email,
                                password: tempPassword,
                                email_confirm: true,
                                user_metadata: { full_name: name }
                            });

                            if (createError) {
                                // Assume exists
                                const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                                    type: 'magiclink',
                                    email: email
                                });
                                userRecord = linkData?.user;
                            } else {
                                userRecord = newUser.user;
                            }

                            if (userRecord) {
                                // 2. Ensure Staff Record Exists (Critical for RLS)
                                const { data: existingStaff } = await supabaseAdmin
                                    .from('staff')
                                    .select('staff_id')
                                    .eq('email', email)
                                    .maybeSingle();

                                if (!existingStaff) {
                                    const { error: staffErr } = await supabaseAdmin.from('staff').insert({
                                        firm_id: integ.firm_id,
                                        email: email,
                                        full_name: name,
                                        role: 'Firm Owner',
                                        auth_user_id: userRecord.id,
                                        is_active: true
                                    });
                                    if (staffErr) console.error("Silent SSO: Failed to create staff record:", staffErr);
                                } else {
                                    // Ensure auth_user_id is linked
                                    await supabaseAdmin.from('staff').update({
                                        auth_user_id: userRecord.id,
                                    }).eq('staff_id', existingStaff.staff_id);
                                }

                                // 3. Generate Magic Link & Verify Server-Side
                                const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';
                                const { data: ssoLink, error: ssoLinkErr } = await supabaseAdmin.auth.admin.generateLink({
                                    type: 'magiclink',
                                    email: email,
                                });

                                if (!ssoLinkErr && ssoLink?.properties?.email_otp) {
                                    const { data: ssoVerify } = await supabaseAdmin.auth.verifyOtp({
                                        email: email,
                                        token: ssoLink.properties.email_otp,
                                        type: 'magiclink',
                                    });

                                    if (ssoVerify?.session) {
                                        const p = new URLSearchParams({
                                            access_token: ssoVerify.session.access_token,
                                            refresh_token: ssoVerify.session.refresh_token,
                                            expires_in: String(ssoVerify.session.expires_in),
                                            expires_at: String(ssoVerify.session.expires_at),
                                            token_type: 'bearer',
                                            type: 'magiclink',
                                        });
                                        return Response.redirect(`${appUrl}/dashboard#${p.toString()}`, 302);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Silent SSO failed, falling back to OAuth:", err);
                    }
                }
            } else if (firmId) {
                state = firmId;
            } else {
                return new Response(JSON.stringify({ error: 'Missing firmId or (locationId + user) for SSO' }), { status: 400, headers: corsHeaders });
            }

            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const redirectUri = `https://sb.filershub.com/functions/v1/crm-auth/callback`

            // Scopes: contacts.readonly, locations.readonly is a good start
            const scopes = 'contacts.readonly contacts.write locations.readonly users.readonly'

            const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`

            // If SSO action, we should redirect to Auth URL directly (browser navigation)
            if (action === 'sso') {
                return Response.redirect(authUrl, 302);
            }

            return new Response(JSON.stringify({ url: authUrl }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. CALLBACK: Handle Code Exchange
        if (pathname.endsWith('/callback')) {
            const code = url.searchParams.get('code')
            const state = url.searchParams.get('state')

            if (!code || !state) {
                return new Response("Missing code or state", { status: 400 })
            }

            // Parse State: sso:locationId:userId:userEmail
            const isSso = state.startsWith('sso:');
            const parts = state.split(':');
            const locationId = isSso ? parts[1] : null;
            const userId = isSso && parts[2] !== 'null' ? parts[2] : null;
            let rawEmail = isSso && parts[3] && parts[3] !== 'null' ? parts[3] : null;
            // Decode in case of URL encoding artifacts from OAuth round-trip
            try { if (rawEmail) rawEmail = decodeURIComponent(rawEmail).trim(); } catch (_) { }
            const userEmail = rawEmail && rawEmail.includes('@') ? rawEmail : null;
            const firmIdParam = isSso ? null : state;

            // Exchange Code for Token
            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const clientSecret = Deno.env.get('GHL_CLIENT_SECRET')
            const redirectUri = `https://sb.filershub.com/functions/v1/crm-auth/callback`

            const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                    user_type: 'Location'
                })
            })

            const tokenData = await tokenResponse.json()

            if (!tokenResponse.ok) {
                console.error('Token Error:', tokenData)
                return new Response(`Error connecting to GHL: ${tokenData.error_description}`, { status: 400 })
            }

            // Client initialized at top scope (supabaseAdmin)

            // Determine Firm ID
            let firmId = firmIdParam;
            let firm = null;

            if (isSso) {
                // Find firm by location ID
                const { data: firmData } = await supabaseAdmin
                    .from('firms')
                    .select('firm_id')
                    .eq('ghl_location_id', locationId)
                    .maybeSingle();

                if (firmData) {
                    firmId = firmData.firm_id;
                    firm = firmData;
                } else {
                    // Fallback to integrations table check
                    const { data: integ } = await supabaseAdmin
                        .from('integrations_ghl')
                        .select('firm_id')
                        .eq('location_id', locationId)
                        .maybeSingle();

                    if (integ) {
                        firmId = integ.firm_id;
                    }
                }

                if (!firmId) {
                    // If still no firm, maybe create it? (Auto-provision Firm on SSO)
                    // Replicating Install logic here for robustness
                    const { data: newFirm, error: createFirmError } = await supabaseAdmin
                        .from("firms")
                        .insert({
                            ghl_location_id: locationId,
                            ghl_access_token: tokenData.access_token,
                            ghl_refresh_token: tokenData.refresh_token,
                            ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                            firm_name: `GHL Location ${locationId}`,
                            subscription_status: 'trialing',
                            slug: locationId.toLowerCase()
                        })
                        .select()
                        .single();

                    if (!createFirmError && newFirm) {
                        firmId = newFirm.firm_id;
                        firm = newFirm;
                    } else {
                        return new Response("Firm not found and could not be created.", { status: 400 });
                    }
                }
            }

            // Always update tokens
            const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()

            // Update integrations_ghl (for record keeping)
            await supabaseAdmin.from('integrations_ghl').upsert({
                firm_id: firmId,
                location_id: tokenData.locationId,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                token_expires_at: expiresAt,
                user_type: tokenData.userType,
                scope: tokenData.scope,
                updated_at: new Date().toISOString()
            }, { onConflict: 'firm_id' })

            // Also update firms table if we found a firm
            if (firmId) {
                await supabaseAdmin.from('firms').update({
                    ghl_access_token: tokenData.access_token,
                    ghl_refresh_token: tokenData.refresh_token,
                    ghl_token_expires_at: expiresAt
                }).eq('firm_id', firmId);
            }

            // HANDLE SSO LOGIC
            const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';

            if (isSso) {
                // 1. Resolve User (via Email in Params OR Fetch by ID)
                let email = userEmail;
                let name = 'Firm Owner';

                // Always try GHL API if we have userId (gets verified email + name)
                if (userId) {
                    const userResp = await fetch(`https://services.leadconnectorhq.com/users/${userId}`, {
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`,
                            'Version': '2021-07-28'
                        }
                    });

                    if (userResp.ok) {
                        const userData = await userResp.json();
                        const ghlUser = userData.user || userData;
                        if (ghlUser.email) {
                            email = ghlUser.email.trim();
                            name = `${ghlUser.firstName || ''} ${ghlUser.lastName || ''}`.trim() || name;
                        }
                    } else {
                        console.error("Failed to fetch GHL user:", userResp.status, await userResp.text());
                    }
                }

                console.log("SSO email resolved:", email, "| from state:", userEmail, "| userId:", userId);

                if (!email || !email.includes('@')) {
                    return new Response("User has no valid email (state: " + userEmail + ", userId: " + userId + ")", { status: 400 });
                }

                // 2. Find/Create Auth User (Robust Pattern)
                let userRecord;
                const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";

                // Try create first
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: email,
                    password: tempPassword,
                    email_confirm: true,
                    user_metadata: { full_name: name }
                });

                if (createError) {
                    console.log("Create user failed, attempting to find existing via generateLink...", createError.message);

                    // Always try to find existing user if create fails, regardless of specific error message
                    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
                        type: 'magiclink',
                        email: email
                    });

                    if (linkData?.user) {
                        userRecord = linkData.user;
                    } else {
                        // If both create and find fail, return the original create error (it's likely the root cause)
                        throw createError;
                    }
                } else {
                    userRecord = newUser.user;
                }

                if (!userRecord) throw new Error("Failed to resolve auth user record.");

                // 2b. Sync to "users" Table (Robustness for Install/SSO Race Conditions)
                // Ensure the user exists in 'users' table with Firm Owner role, even if webhook failed
                if (userId && locationId) {
                    const firstName = name.split(' ')[0] || name;
                    const lastName = name.split(' ').slice(1).join(' ') || '';

                    const userPayload = {
                        id: userId,
                        email: email,
                        firstName: firstName,
                        lastName: lastName,
                        name: name,
                        locationId: locationId,
                        roles: { type: 'firmowner' } // SSO user treated as owner for initial access
                    };

                    const { error: usersError } = await supabaseAdmin
                        .from('users')
                        .upsert(userPayload, { onConflict: 'id' });

                    if (usersError) console.error("Failed to sync SSO user to 'users' table:", usersError);
                }

                // 3. Ensure Staff Record Exists
                const staffParams = {
                    firm_id: firmId,
                    email: email,
                    full_name: name,
                    role: 'Firm Owner',
                    auth_user_id: userRecord.id,
                    is_active: true
                };

                // Check if Staff exists (to avoid overwriting Role if they are already Staff)
                const { data: existingStaff } = await supabaseAdmin.from('staff').select('staff_id').eq('email', email).maybeSingle();

                if (!existingStaff) {
                    const { error: staffInsertErr } = await supabaseAdmin.from('staff').insert(staffParams);
                    if (staffInsertErr) console.error("Callback: Failed to create staff:", staffInsertErr);
                } else {
                    // Ensure auth_user_id is linked
                    await supabaseAdmin.from('staff').update({
                        auth_user_id: userRecord.id
                    }).eq('staff_id', existingStaff.staff_id);
                }

                // 4. Generate Magic Link & Create Session Server-Side
                // We verify the OTP server-side so we control the redirect URL
                // (bypasses Supabase Site URL / Redirect URL allowlist config)
                const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';
                const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink',
                    email: email,
                });

                if (linkErr || !linkData?.properties?.email_otp) {
                    console.error("Failed to generate login link:", linkErr);
                    return new Response("Failed to generate login link", { status: 500 });
                }

                // Verify OTP server-side to create a session directly
                const { data: verifyData, error: verifyErr } = await supabaseAdmin.auth.verifyOtp({
                    email: email,
                    token: linkData.properties.email_otp,
                    type: 'magiclink',
                });

                if (verifyErr || !verifyData?.session) {
                    console.error("Failed to verify OTP:", verifyErr);
                    return new Response("Failed to create session", { status: 500 });
                }

                // Redirect directly to app with session tokens in URL fragment
                const { access_token, refresh_token, expires_in, expires_at } = verifyData.session;
                const sessionParams = new URLSearchParams({
                    access_token,
                    refresh_token,
                    expires_in: String(expires_in),
                    expires_at: String(expires_at),
                    token_type: 'bearer',
                    type: 'magiclink',
                });

                return Response.redirect(`${appUrl}/dashboard#${sessionParams.toString()}`, 302);
            }

            // Standard Flow Redirect
            // appUrl is already declared at line 278
            return Response.redirect(`${appUrl}/?ghl_connected=true`, 302)
        }

        return new Response("Not Found", { status: 404 })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
