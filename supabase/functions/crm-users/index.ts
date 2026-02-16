// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // User-scoped client (for auth + RLS reads)
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Admin client (for creating auth users + staff records)
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) throw new Error('Unauthorized — no active session')

        // Parse body for action + payload (always POST from client)
        let body: any = {};
        try { body = await req.json(); } catch (_) { /* no body */ }
        const url = new URL(req.url)
        const action = body.action || url.searchParams.get('action')

        // 1. Get staff record
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('firm_id, role')
            .eq('auth_user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`)
        if (!staffData) throw new Error(`No active staff record found for user ${user.email}`)
        if (staffData.role !== 'Firm Owner') throw new Error('Only firm owners can manage CRM staff')

        const firmId = staffData.firm_id;

        // 2. Get GHL tokens — check integrations_ghl first, fall back to firms table
        let accessToken = null;
        let ghlLocationId = null;
        let tokenSource = '';

        const { data: integData } = await supabaseAdmin
            .from('integrations_ghl')
            .select('access_token, refresh_token, token_expires_at, location_id')
            .eq('firm_id', firmId)
            .maybeSingle()

        if (integData?.access_token) {
            accessToken = integData.access_token;
            ghlLocationId = integData.location_id;
            tokenSource = 'integrations_ghl';

            // Refresh if expired
            if (integData.token_expires_at && new Date(integData.token_expires_at) < new Date()) {
                console.log("Token expired (integrations_ghl), refreshing...");
                const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: Deno.env.get('GHL_CLIENT_ID')!,
                        client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                        grant_type: 'refresh_token',
                        refresh_token: integData.refresh_token,
                    })
                });
                if (refreshResp.ok) {
                    const refreshData = await refreshResp.json();
                    accessToken = refreshData.access_token;
                    const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
                    await supabaseAdmin.from('integrations_ghl').update({
                        access_token: refreshData.access_token,
                        refresh_token: refreshData.refresh_token,
                        token_expires_at: newExpiry,
                    }).eq('firm_id', firmId);
                    await supabaseAdmin.from('firms').update({
                        ghl_access_token: refreshData.access_token,
                        ghl_refresh_token: refreshData.refresh_token,
                        ghl_token_expires_at: newExpiry,
                    }).eq('firm_id', firmId);
                    console.log("Token refreshed successfully (integrations_ghl)");
                } else {
                    const errText = await refreshResp.text();
                    console.error("Token refresh failed (integrations_ghl):", refreshResp.status, errText);
                    // Token is expired and refresh failed — clear it so we try firms table
                    accessToken = null;
                    ghlLocationId = null;
                }
            }
        }

        if (!accessToken) {
            // Fallback: tokens on firms table
            const { data: firmData } = await supabaseAdmin
                .from('firms')
                .select('ghl_access_token, ghl_refresh_token, ghl_token_expires_at, ghl_location_id')
                .eq('firm_id', firmId)
                .maybeSingle()

            if (firmData?.ghl_access_token) {
                accessToken = firmData.ghl_access_token;
                ghlLocationId = firmData.ghl_location_id;
                tokenSource = 'firms';

                // Refresh if expired
                if (firmData.ghl_token_expires_at && new Date(firmData.ghl_token_expires_at) < new Date()) {
                    console.log("Token expired (firms), refreshing...");
                    const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: Deno.env.get('GHL_CLIENT_ID')!,
                            client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                            grant_type: 'refresh_token',
                            refresh_token: firmData.ghl_refresh_token,
                        })
                    });
                    if (refreshResp.ok) {
                        const refreshData = await refreshResp.json();
                        accessToken = refreshData.access_token;
                        const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
                        await supabaseAdmin.from('firms').update({
                            ghl_access_token: refreshData.access_token,
                            ghl_refresh_token: refreshData.refresh_token,
                            ghl_token_expires_at: newExpiry,
                        }).eq('firm_id', firmId);
                        console.log("Token refreshed successfully (firms)");
                    } else {
                        const errText = await refreshResp.text();
                        console.error("Token refresh failed (firms):", refreshResp.status, errText);
                        throw new Error('CRM token expired and refresh failed. Please reconnect the CRM integration.');
                    }
                }
            }
        }

        if (!accessToken) {
            throw new Error('No CRM access token found. Please connect your GHL location in Settings.')
        }
        if (!ghlLocationId) {
            throw new Error('No GHL location ID found for this firm. Please reconnect the CRM integration.')
        }

        console.log(`Using token from ${tokenSource}, locationId: ${ghlLocationId}, action: ${action}`);

        // LIST: Fetch GHL users + existing staff emails
        if (action === 'list') {
            const ghlUrl = `https://services.leadconnectorhq.com/users/?locationId=${ghlLocationId}`;
            console.log("Fetching GHL users from:", ghlUrl);

            const response = await fetch(ghlUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Version': '2021-07-28'
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("GHL users fetch failed:", response.status, errText);
                if (response.status === 401) {
                    throw new Error('CRM authorization failed (401). Your token may be expired — try reconnecting the integration.');
                }
                if (response.status === 403) {
                    throw new Error('CRM access denied (403). Ensure the app has the "users.readonly" scope in your GHL Marketplace settings.');
                }
                if (response.status === 422) {
                    throw new Error(`CRM validation error (422): ${errText}`);
                }
                throw new Error(`CRM API error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const ghlUsers = data.users || [];
            console.log(`Fetched ${ghlUsers.length} GHL users`);

            // Get existing staff emails for this firm to mark who already has access
            const { data: existingStaff } = await supabaseAdmin
                .from('staff')
                .select('email, role, ghl_user_id')
                .eq('firm_id', firmId)
                .eq('is_active', true)

            const staffEmails = new Set((existingStaff || []).map((s: any) => s.email?.toLowerCase()));
            const staffByGhlId: Record<string, any> = {};
            (existingStaff || []).forEach((s: any) => {
                if (s.ghl_user_id) staffByGhlId[s.ghl_user_id] = s;
            });

            // Enrich GHL users with hasAccess flag
            const enrichedUsers = ghlUsers.map((u: any) => ({
                id: u.id,
                name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                role: u.role,
                type: u.type,
                hasAccess: staffEmails.has(u.email?.toLowerCase()) || !!staffByGhlId[u.id],
                appRole: staffByGhlId[u.id]?.role || (existingStaff || []).find((s: any) => s.email?.toLowerCase() === u.email?.toLowerCase())?.role || null,
            }));

            return new Response(
                JSON.stringify({ users: enrichedUsers }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // GRANT ACCESS: Create auth user + staff record
        if (action === 'grant') {
            const { ghlUserId, email, name, role } = body;

            if (!email) throw new Error('Email is required');

            // Check if staff already exists at this firm
            const { data: existingStaff } = await supabaseAdmin
                .from('staff')
                .select('staff_id')
                .eq('email', email.toLowerCase())
                .eq('firm_id', firmId)
                .maybeSingle();

            if (existingStaff) {
                return new Response(
                    JSON.stringify({ error: 'This user already has access to the app' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Create/find auth user
            let userRecord;
            const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: name }
            });

            if (createError) {
                const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink', email: email
                });
                userRecord = linkData?.user;
            } else {
                userRecord = newUser.user;
            }

            // Create staff record
            const { error: staffError } = await supabaseAdmin
                .from('staff')
                .insert({
                    firm_id: firmId,
                    email: email.toLowerCase(),
                    full_name: name,
                    role: role || 'Tax Pro',
                    auth_user_id: userRecord?.id || null,
                    is_active: true,
                    ghl_user_id: ghlUserId || null,
                    ghl_location_id: ghlLocationId,
                });

            if (staffError) throw staffError;

            return new Response(
                JSON.stringify({ message: 'Access granted successfully' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // REVOKE ACCESS: Deactivate staff record
        if (action === 'revoke') {
            const { staffId } = body;
            if (!staffId) throw new Error('staffId is required');

            const { error } = await supabaseAdmin
                .from('staff')
                .update({ is_active: false })
                .eq('staff_id', staffId)
                .eq('firm_id', firmId);

            if (error) throw error;

            return new Response(
                JSON.stringify({ message: 'Access revoked' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        throw new Error('Invalid action. Use ?action=list, ?action=grant, or ?action=revoke')

    } catch (error) {
        console.error("crm-users error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
