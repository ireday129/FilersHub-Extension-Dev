// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

        // 1. INIT: Generate Auth URL
        if (pathname.endsWith('/init') || (req.method === 'POST' && body.action === 'init')) {
            const action = url.searchParams.get('action') || body.action;
            const firmId = url.searchParams.get('firmId') || body.firmId;
            const locationId = url.searchParams.get('locationId') || body.locationId;
            const userId = url.searchParams.get('userId') || body.userId;

            // For SSO, we need locationId AND userId
            let state = '';
            if (action === 'sso' && locationId && userId) {
                state = `sso:${locationId}:${userId}`;
            } else if (firmId) {
                state = firmId;
            } else {
                return new Response(JSON.stringify({ error: 'Missing firmId or (locationId + userId) for SSO' }), { status: 400, headers: corsHeaders });
            }

            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const redirectUri = `https://sb.filershub.com/functions/v1/crm-auth/callback`

            // Scopes: contacts.readonly, locations.readonly is a good start
            // Note: GHL scopes are space-separated
            const scopes = 'contacts.readonly contacts.write locations.readonly users.readonly'

            const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${redirectUri}&client_id=${clientId}&scope=${scopes}&state=${state}`

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

            // Parse State
            const isSso = state.startsWith('sso:');
            const parts = state.split(':');
            const locationId = isSso ? parts[1] : null;
            const userId = isSso ? parts[2] : null;
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

            const supabaseAdmin = createClient(
                Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )

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
                // 1. Fetch User
                const userResp = await fetch(`https://services.leadconnectorhq.com/users/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        'Version': '2021-07-28'
                    }
                });

                if (!userResp.ok) {
                    console.error("Failed to fetch user:", await userResp.text());
                    return new Response("Failed to fetch user from GHL", { status: 500 });
                }

                const userData = await userResp.json();
                const ghlUser = userData.user || userData; // Handle GHL wrapper variation
                const email = ghlUser.email;
                const name = `${ghlUser.firstName} ${ghlUser.lastName}`;

                if (!email) {
                    return new Response("User has no email", { status: 400 });
                }

                // 2. Find/Create Auth User
                let userRecord;
                // Try creating user first
                const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: email,
                    password: tempPassword,
                    email_confirm: true,
                    user_metadata: { full_name: name }
                });

                if (createError) {
                    // If user exists, find them via generateLink
                    const isDuplicate = createError.message?.toLowerCase().includes("already registered") ||
                        createError.message?.toLowerCase().includes("unique constraint") ||
                        createError.status === 400;

                    if (isDuplicate) {
                        // We found them. We'll get references by generating the link later.
                        // Actually, generateLink returns the user object too.
                        // But we need the ID to link Staff.
                        // We'll trust the email link step to handle the login.
                        // But we need to ensure the STAFF record exists before redirecting?
                        // Yes.
                        // "getUserByEmail" via generateLink:
                        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
                            type: 'magiclink',
                            email: email
                        });
                        if (linkError || !linkData.user) {
                            return new Response("User exists but could not resolve", { status: 500 });
                        }
                        userRecord = linkData.user;
                    } else {
                        throw createError;
                    }
                } else {
                    userRecord = newUser.user;
                }

                // 3. Ensure Staff Record Exists
                const params = {
                    firm_id: firmId,
                    email: email,
                    full_name: name,
                    role: 'Firm Owner', // Default to Owner for simplicity in V1/SSO? 
                    auth_user_id: userRecord.id,
                    ghl_user_id: userId,
                    ghl_location_id: locationId,
                    invite_status: 'accepted',
                    is_active: true
                };

                // Check if Staff exists (to avoid overwriting Role if they are already Staff)
                const { data: existingStaff } = await supabaseAdmin.from('staff').select('staff_id').eq('email', email).maybeSingle();

                if (!existingStaff) {
                    await supabaseAdmin.from('staff').insert(params);
                } else {
                    // Ensure GHL IDs are linked
                    await supabaseAdmin.from('staff').update({
                        ghl_user_id: userId,
                        ghl_location_id: locationId,
                        auth_user_id: userRecord.id
                    }).eq('staff_id', existingStaff.staff_id);
                }

                // 4. Generate Magic Link & Redirect
                const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink',
                    email: email,
                    options: {
                        redirectTo: `${appUrl}/dashboard` // Magic link handles the auth token verify
                    }
                });

                if (linkErr) {
                    return new Response("Failed to generate login link", { status: 500 });
                }

                return Response.redirect(link.action_link, 302);
            }

            // Standard Flow Redirect
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
