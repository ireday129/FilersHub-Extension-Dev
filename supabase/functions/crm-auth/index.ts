// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Trigger deployment check

const ALLOWED_ORIGINS = [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'chrome-extension://',
];

function getCorsOrigin(req: Request): string {
    const origin = req.headers.get('origin') || '';
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) return origin;
    if (origin.includes('gohighlevel.com') || origin.includes('leadconnectorhq.com')) return origin;
    return ALLOWED_ORIGINS[0];
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Overridden per-request below
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders })
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

        // Helper: Fetch real location name + logo from GHL API
        const fetchLocationInfo = async (locId: string, accessToken: string) => {
            try {
                const resp = await fetch(`https://services.leadconnectorhq.com/locations/${locId}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Version': '2021-07-28' }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const loc = data.location || data;
                    return { name: loc.name || null, logoUrl: loc.logoUrl || null };
                }
            } catch (e) { console.error("Failed to fetch GHL location info:", e); }
            return { name: null, logoUrl: null };
        };

        // 0. EMAIL LOOKUP: Verify staff email against GHL and create session
        if (req.method === 'POST' && body.action === 'email-lookup') {
            const email = (body.email || '').trim().toLowerCase();
            const requestedLocationId = (body.locationId || '').trim();
            const requestedFirmId = (body.firmId || '').trim();

            if (!email || !email.includes('@')) {
                return new Response(JSON.stringify({ error: 'Valid email is required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 1. Find staff records by email → support multi-firm
            const { data: staffRecords } = await supabaseAdmin
                .from('staff')
                .select('staff_id, firm_id, full_name, ghl_location_id')
                .eq('email', email)
                .eq('is_active', true);

            if (!staffRecords || staffRecords.length === 0) {
                return new Response(JSON.stringify({ error: 'No active staff account found for this email' }), {
                    status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Resolve to a single staff record
            let staffRecord;

            if (staffRecords.length === 1) {
                staffRecord = staffRecords[0];
            } else if (requestedFirmId) {
                // User explicitly selected a firm (from firm chooser UI)
                staffRecord = staffRecords.find((s: any) => s.firm_id === requestedFirmId);
                if (!staffRecord) {
                    return new Response(JSON.stringify({ error: 'You are not a member of the selected firm' }), {
                        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } else if (requestedLocationId) {
                // Extension provided a GHL locationId — match by ghl_location_id on staff or firm
                staffRecord = staffRecords.find((s: any) => s.ghl_location_id === requestedLocationId);
                if (!staffRecord) {
                    // Check which firm owns this locationId
                    const { data: firmByLoc } = await supabaseAdmin
                        .from('firms')
                        .select('firm_id')
                        .eq('ghl_location_id', requestedLocationId)
                        .maybeSingle();
                    if (firmByLoc) {
                        staffRecord = staffRecords.find((s: any) => s.firm_id === firmByLoc.firm_id);
                    }
                }
                if (!staffRecord) {
                    // locationId didn't resolve — return firm list for user to choose
                    const firmIds = staffRecords.map((s: any) => s.firm_id);
                    const { data: firms } = await supabaseAdmin
                        .from('firms')
                        .select('firm_id, firm_name, logo_url')
                        .in('firm_id', firmIds);
                    return new Response(JSON.stringify({
                        error: 'multiple_firms',
                        message: 'You belong to multiple firms. Please select one.',
                        firms: firms || []
                    }), {
                        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } else {
                // Multiple firms, no locationId or firmId to disambiguate — return firm list
                const firmIds = staffRecords.map((s: any) => s.firm_id);
                const { data: firms } = await supabaseAdmin
                    .from('firms')
                    .select('firm_id, firm_name, logo_url')
                    .in('firm_id', firmIds);
                return new Response(JSON.stringify({
                    error: 'multiple_firms',
                    message: 'You belong to multiple firms. Please select one.',
                    firms: firms || []
                }), {
                    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 2. Get firm's GHL location ID and tokens
            const { data: firmData } = await supabaseAdmin
                .from('firms')
                .select('ghl_location_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at')
                .eq('firm_id', staffRecord.firm_id)
                .maybeSingle();

            if (!firmData?.ghl_location_id) {
                return new Response(JSON.stringify({ error: 'Firm is not connected to a CRM location' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 3. Get stored GHL token — integrations_ghl is the single source of truth
            let integ: any = null;

            const { data: integData } = await supabaseAdmin
                .from('integrations_ghl')
                .select('access_token, refresh_token, token_expires_at, firm_id')
                .eq('firm_id', staffRecord.firm_id)
                .maybeSingle();

            if (integData?.access_token) {
                integ = integData;
            } else if (firmData.ghl_access_token) {
                // Migrate: tokens on firms table but not yet in integrations_ghl
                integ = {
                    access_token: firmData.ghl_access_token,
                    refresh_token: firmData.ghl_refresh_token,
                    token_expires_at: firmData.ghl_token_expires_at,
                    firm_id: staffRecord.firm_id,
                };
                // Persist migration to integrations_ghl
                await supabaseAdmin.from('integrations_ghl').upsert({
                    firm_id: staffRecord.firm_id,
                    location_id: firmData.ghl_location_id,
                    access_token: firmData.ghl_access_token,
                    refresh_token: firmData.ghl_refresh_token,
                    token_expires_at: firmData.ghl_token_expires_at,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'firm_id' });
            }

            if (!integ?.access_token) {
                return new Response(JSON.stringify({ error: 'CRM integration not configured for this firm' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            let accessToken = integ.access_token;
            if (integ.token_expires_at && new Date(integ.token_expires_at) < new Date()) {
                const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: Deno.env.get('GHL_CLIENT_ID')!,
                        client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                        grant_type: 'refresh_token',
                        refresh_token: integ.refresh_token,
                    })
                });
                if (refreshResp.ok) {
                    const refreshData = await refreshResp.json();
                    accessToken = refreshData.access_token;
                    const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
                    // Write only to integrations_ghl (single source of truth)
                    await supabaseAdmin.from('integrations_ghl').update({
                        access_token: refreshData.access_token,
                        refresh_token: refreshData.refresh_token,
                        token_expires_at: newExpiry,
                    }).eq('firm_id', integ.firm_id);
                } else {
                    return new Response(JSON.stringify({ error: 'CRM token expired and could not be refreshed' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // 4. Verify email against GHL Users API (soft check — staff record is already trusted)
            try {
                const usersResp = await fetch(
                    `https://services.leadconnectorhq.com/users/search?locationId=${firmData.ghl_location_id}&query=${encodeURIComponent(email)}&limit=10`,
                    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Version': '2021-07-28' } }
                );
                if (usersResp.ok) {
                    const usersData = await usersResp.json();
                    const users = usersData.users || [];
                    const ghlUserVerified = users.some((u: any) => u.email?.toLowerCase() === email);
                    if (!ghlUserVerified) {
                        console.warn("Email-lookup: GHL user search did not match email, proceeding with staff record trust:", email);
                    }
                } else {
                    console.warn("Email-lookup: GHL user search failed:", usersResp.status);
                }
            } catch (ghlErr) {
                console.warn("Email-lookup: GHL user search error (non-blocking):", ghlErr);
            }

            // 5. Create/find Supabase auth user and create session
            let userRecord;
            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: staffRecord.full_name }
            });

            if (createError) {
                const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink', email: email
                });
                userRecord = linkData?.user;
            } else {
                userRecord = newUser.user;
            }

            if (!userRecord) {
                return new Response(JSON.stringify({ error: 'Failed to create user session' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Link auth_user_id to staff record
            await supabaseAdmin.from('staff').update({
                auth_user_id: userRecord.id
            }).eq('staff_id', staffRecord.staff_id);

            // Generate magic link + verify server-side for session
            const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink', email: email
            });

            if (linkErr || !linkData?.properties?.email_otp) {
                return new Response(JSON.stringify({ error: 'Failed to generate login session' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const { data: verifyData, error: verifyErr } = await supabaseAdmin.auth.verifyOtp({
                email: email,
                token: linkData.properties.email_otp,
                type: 'magiclink',
            });

            if (verifyErr || !verifyData?.session) {
                return new Response(JSON.stringify({ error: 'Failed to create session' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({
                access_token: verifyData.session.access_token,
                refresh_token: verifyData.session.refresh_token,
                expires_in: verifyData.session.expires_in,
                expires_at: verifyData.session.expires_at,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

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
                    .select('access_token, refresh_token, token_expires_at, firm_id')
                    .eq('location_id', locationId)
                    .maybeSingle();

                if (integ?.access_token) {
                    // Refresh token if expired
                    let ssoAccessToken = integ.access_token;
                    if (integ.token_expires_at && new Date(integ.token_expires_at) < new Date()) {
                        try {
                            const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: new URLSearchParams({
                                    client_id: Deno.env.get('GHL_CLIENT_ID')!,
                                    client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                                    grant_type: 'refresh_token',
                                    refresh_token: integ.refresh_token,
                                })
                            });
                            if (refreshResp.ok) {
                                const refreshData = await refreshResp.json();
                                ssoAccessToken = refreshData.access_token;
                                // Write only to integrations_ghl (single source of truth)
                                await supabaseAdmin.from('integrations_ghl').update({
                                    access_token: refreshData.access_token,
                                    refresh_token: refreshData.refresh_token,
                                    token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
                                }).eq('firm_id', integ.firm_id);
                            } else {
                                console.error("Silent SSO: Token refresh failed:", await refreshResp.text());
                            }
                        } catch (refreshErr) {
                            console.error("Silent SSO: Token refresh error:", refreshErr);
                        }
                    }
                    try {
                        let email = userEmail;
                        let name = 'Firm Owner';

                        // Verify User against GHL API using stored token
                        // If we have userId, fetch profile. If only email, maybe verify /users/me or search?
                        // For safety, let's try fetch user by ID if available. 
                        if (userId && userId !== 'null') {
                            const userResp = await fetch(`https://services.leadconnectorhq.com/users/${userId}`, {
                                headers: {
                                    'Authorization': `Bearer ${ssoAccessToken}`,
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
                                // 2. Ensure Staff Record Exists (Critical for RLS) — multi-firm safe
                                const { data: existingStaff } = await supabaseAdmin
                                    .from('staff')
                                    .select('staff_id')
                                    .eq('email', email)
                                    .eq('firm_id', integ.firm_id)
                                    .maybeSingle();

                                if (!existingStaff) {
                                    const { error: staffErr } = await supabaseAdmin.from('staff').insert({
                                        firm_id: integ.firm_id,
                                        email: email,
                                        full_name: name,
                                        role: 'Firm Owner',
                                        auth_user_id: userRecord.id,
                                        is_active: true,
                                        ghl_user_id: userId !== 'null' ? userId : null,
                                        ghl_location_id: locationId
                                    });
                                    if (staffErr) console.error("Silent SSO: Failed to create staff record:", staffErr);
                                } else {
                                    // Ensure auth_user_id is linked
                                    await supabaseAdmin.from('staff').update({
                                        auth_user_id: userRecord.id,
                                        ghl_user_id: userId !== 'null' ? userId : null,
                                        ghl_location_id: locationId
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
            } else if (action === 'login') {
                // Generic CRM login — user will choose their GHL location during OAuth
                state = 'login';
            } else if (firmId) {
                state = firmId;
            } else {
                return new Response(JSON.stringify({ error: 'Missing firmId or (locationId + user) for SSO' }), { status: 400, headers: corsHeaders });
            }

            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const redirectUri = `${Deno.env.get('SUPABASE_URL') || Deno.env.get('URL') || 'https://sb.filershub.com'}/functions/v1/crm-auth/callback`

            // Scopes: contacts.readonly, locations.readonly is a good start
            const scopes = 'contacts.readonly contacts.write locations.readonly users.readonly'

            const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`

            // CRM Login: redirect directly to GHL OAuth
            if (action === 'login') {
                return Response.redirect(authUrl, 302);
            }

            // If SSO action, redirect to Auth URL
            if (action === 'sso') {
                const isIframe = url.searchParams.get('iframe') === '1';
                if (isIframe) {
                    // Silent SSO failed and we're in an iframe — GHL OAuth won't load in iframe.
                    // Redirect back to app with show_launchpad flag so it shows the OAuth button.
                    const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';
                    const returnParams = new URLSearchParams();
                    returnParams.set('show_launchpad', 'true');
                    if (locationId) returnParams.set('location_id', locationId);
                    if (userId && userId !== 'null') returnParams.set('user_id', userId);
                    if (userEmail && userEmail !== 'null') returnParams.set('user_email', userEmail);
                    return Response.redirect(`${appUrl}/?${returnParams.toString()}`, 302);
                }
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

            // Parse State: sso:locationId:userId:userEmail OR 'login' OR firmId
            const isSso = state.startsWith('sso:');
            const isLogin = state === 'login';
            const parts = state.split(':');
            const locationId = isSso ? parts[1] : null;
            const userId = isSso && parts[2] !== 'null' ? parts[2] : null;
            let rawEmail = isSso && parts[3] && parts[3] !== 'null' ? parts[3] : null;
            // Decode in case of URL encoding artifacts from OAuth round-trip
            try { if (rawEmail) rawEmail = decodeURIComponent(rawEmail).trim(); } catch (_) { }
            const userEmail = rawEmail && rawEmail.includes('@') ? rawEmail : null;
            const firmIdParam = (isSso || isLogin) ? null : state;

            // Exchange Code for Token
            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const clientSecret = Deno.env.get('GHL_CLIENT_SECRET')
            const redirectUri = `${Deno.env.get('SUPABASE_URL') || Deno.env.get('URL') || 'https://sb.filershub.com'}/functions/v1/crm-auth/callback`

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
                    const locInfo = await fetchLocationInfo(locationId, tokenData.access_token);
                    const { data: newFirm, error: createFirmError } = await supabaseAdmin
                        .from("firms")
                        .insert({
                            ghl_location_id: locationId,
                            ghl_access_token: tokenData.access_token,
                            ghl_refresh_token: tokenData.refresh_token,
                            ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                            firm_name: locInfo.name || `GHL Location ${locationId}`,
                            logo_url: locInfo.logoUrl || null,
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
            } else if (isLogin) {
                // CRM Login flow: resolve firm from token's locationId
                const tokenLocationId = tokenData.locationId;
                if (tokenLocationId) {
                    const { data: firmData } = await supabaseAdmin
                        .from('firms')
                        .select('firm_id')
                        .eq('ghl_location_id', tokenLocationId)
                        .maybeSingle();

                    if (firmData) {
                        firmId = firmData.firm_id;
                        firm = firmData;
                    } else {
                        const { data: integ } = await supabaseAdmin
                            .from('integrations_ghl')
                            .select('firm_id')
                            .eq('location_id', tokenLocationId)
                            .maybeSingle();

                        if (integ) {
                            firmId = integ.firm_id;
                        }
                    }

                    if (!firmId) {
                        // Auto-provision firm
                        const locInfo = await fetchLocationInfo(tokenLocationId, tokenData.access_token);
                        const { data: newFirm, error: createFirmError } = await supabaseAdmin
                            .from("firms")
                            .insert({
                                ghl_location_id: tokenLocationId,
                                ghl_access_token: tokenData.access_token,
                                ghl_refresh_token: tokenData.refresh_token,
                                ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                                firm_name: locInfo.name || `GHL Location ${tokenLocationId}`,
                                logo_url: locInfo.logoUrl || null,
                                subscription_status: 'trialing',
                                slug: tokenLocationId.toLowerCase()
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

            // Update firms table metadata (no tokens — integrations_ghl is source of truth)
            if (firmId) {
                // Enrich placeholder firm names with real GHL location data
                const { data: currentFirm } = await supabaseAdmin
                    .from('firms')
                    .select('firm_name')
                    .eq('firm_id', firmId)
                    .maybeSingle();

                if (currentFirm?.firm_name?.startsWith('GHL Location ')) {
                    const locInfo = await fetchLocationInfo(tokenData.locationId, tokenData.access_token);
                    const firmUpdate: Record<string, any> = {};
                    if (locInfo.name) firmUpdate.firm_name = locInfo.name;
                    if (locInfo.logoUrl) firmUpdate.logo_url = locInfo.logoUrl;
                    if (Object.keys(firmUpdate).length > 0) {
                        await supabaseAdmin.from('firms').update(firmUpdate).eq('firm_id', firmId);
                    }
                }
            }

            // HANDLE SSO LOGIC
            const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';

            if (isSso || isLogin) {
                // 1. Resolve User (via Email in Params OR Fetch by ID from GHL API)
                let email = userEmail;
                let name = 'Firm Owner';

                // For CRM login flow, resolve userId from token response
                const resolvedUserId = isLogin ? tokenData.userId : userId;

                // Always try GHL API if we have userId (gets verified email + name)
                if (resolvedUserId) {
                    const userResp = await fetch(`https://services.leadconnectorhq.com/users/${resolvedUserId}`, {
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

                console.log("SSO/Login email resolved:", email, "| from state:", userEmail, "| userId:", resolvedUserId);

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
                const resolvedLocationId = isLogin ? tokenData.locationId : locationId;
                if (resolvedUserId && resolvedLocationId) {
                    const firstName = name.split(' ')[0] || name;
                    const lastName = name.split(' ').slice(1).join(' ') || '';

                    const userPayload = {
                        id: resolvedUserId,
                        email: email,
                        firstName: firstName,
                        lastName: lastName,
                        name: name,
                        locationId: resolvedLocationId,
                        roles: { type: 'firmowner' } // SSO user treated as owner for initial access
                    };

                    const { error: usersError } = await supabaseAdmin
                        .from('users')
                        .upsert(userPayload, { onConflict: 'id' });

                    if (usersError) console.error("Failed to sync SSO user to 'users' table:", usersError);
                }

                // 3. Ensure Staff Record Exists — multi-firm safe
                const staffParams = {
                    firm_id: firmId,
                    email: email,
                    full_name: name,
                    role: 'Firm Owner',
                    auth_user_id: userRecord.id,
                    is_active: true,
                    ghl_user_id: resolvedUserId || null,
                    ghl_location_id: resolvedLocationId || null
                };

                // Check if Staff exists at THIS firm (to avoid overwriting Role if they are already Staff)
                const { data: existingStaff } = await supabaseAdmin.from('staff').select('staff_id').eq('email', email).eq('firm_id', firmId).maybeSingle();

                if (!existingStaff) {
                    const { error: staffInsertErr } = await supabaseAdmin.from('staff').insert(staffParams);
                    if (staffInsertErr) console.error("Callback: Failed to create staff:", staffInsertErr);
                } else {
                    // Ensure auth_user_id and GHL fields are linked
                    await supabaseAdmin.from('staff').update({
                        auth_user_id: userRecord.id,
                        ghl_user_id: resolvedUserId || null,
                        ghl_location_id: resolvedLocationId || null
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

            // Standard Flow: Also ensure installing user has a staff record
            // tokenData contains userId and locationId from the OAuth token response
            if (firmId && tokenData.userId) {
                try {
                    const userResp = await fetch(`https://services.leadconnectorhq.com/users/${tokenData.userId}`, {
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`,
                            'Version': '2021-07-28'
                        }
                    });

                    if (userResp.ok) {
                        const userData = await userResp.json();
                        const ghlUser = userData.user || userData;
                        const email = ghlUser.email?.trim();
                        const name = `${ghlUser.firstName || ''} ${ghlUser.lastName || ''}`.trim() || 'Firm Owner';

                        if (email) {
                            // Find/Create auth user
                            let userRecord;
                            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
                            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                                email, password: tempPassword, email_confirm: true,
                                user_metadata: { full_name: name }
                            });
                            if (createError) {
                                const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
                                userRecord = linkData?.user;
                            } else {
                                userRecord = newUser.user;
                            }

                            if (userRecord) {
                                // Upsert staff record — multi-firm safe
                                const { data: existingStaff } = await supabaseAdmin.from('staff')
                                    .select('staff_id').eq('email', email).eq('firm_id', firmId).maybeSingle();

                                if (!existingStaff) {
                                    await supabaseAdmin.from('staff').insert({
                                        firm_id: firmId, email, full_name: name,
                                        role: 'Firm Owner', auth_user_id: userRecord.id, is_active: true,
                                        ghl_user_id: tokenData.userId, ghl_location_id: tokenData.locationId
                                    });
                                } else {
                                    await supabaseAdmin.from('staff').update({
                                        auth_user_id: userRecord.id, is_active: true,
                                        ghl_user_id: tokenData.userId, ghl_location_id: tokenData.locationId
                                    }).eq('staff_id', existingStaff.staff_id);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Standard flow: Failed to create staff record:", err);
                }
            }

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
