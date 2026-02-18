// @ts-nocheck
// Deployed with --no-verify-jwt (public endpoint for GHL staff sync)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Try to get a valid GHL access token — returns null if unavailable
async function getAccessToken(supabaseAdmin: any, firmId: string): Promise<string | null> {
    // Try integrations_ghl first
    const { data: integData } = await supabaseAdmin
        .from('integrations_ghl')
        .select('access_token, refresh_token, token_expires_at')
        .eq('firm_id', firmId)
        .maybeSingle();

    if (integData?.access_token) {
        // Token is still valid
        if (!integData.token_expires_at || new Date(integData.token_expires_at) > new Date()) {
            return integData.access_token;
        }
        // Try refresh
        try {
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
                console.log("Token refreshed successfully");
                return refreshData.access_token;
            }
        } catch (e) {
            console.warn("Token refresh failed:", e.message);
        }
    }

    // Fallback: try firms table
    const { data: firm } = await supabaseAdmin
        .from('firms')
        .select('ghl_access_token, ghl_refresh_token, ghl_token_expires_at')
        .eq('firm_id', firmId)
        .maybeSingle();

    if (firm?.ghl_access_token) {
        if (!firm.ghl_token_expires_at || new Date(firm.ghl_token_expires_at) > new Date()) {
            return firm.ghl_access_token;
        }
        try {
            const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: Deno.env.get('GHL_CLIENT_ID')!,
                    client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                    grant_type: 'refresh_token',
                    refresh_token: firm.ghl_refresh_token,
                })
            });
            if (refreshResp.ok) {
                const refreshData = await refreshResp.json();
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
                console.log("Token refreshed from firms fallback");
                return refreshData.access_token;
            }
        } catch (e) {
            console.warn("Firms token refresh failed:", e.message);
        }
    }

    console.warn("No valid GHL token available — will use database fallback");
    return null;
}

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders })
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

        // 2. Get GHL location ID for this firm
        const { data: firmData } = await supabaseAdmin
            .from('firms')
            .select('ghl_location_id')
            .eq('firm_id', firmId)
            .maybeSingle()

        const ghlLocationId = firmData?.ghl_location_id;

        if (!ghlLocationId) {
            throw new Error('No GHL location ID found for this firm. Please reconnect the CRM integration.')
        }

        console.log(`crm-users action=${action}, firmId=${firmId}, locationId=${ghlLocationId}`);

        // LIST: Fetch live CRM users from GHL API, fall back to cached database
        if (action === 'list') {
            let ghlUsers: any[] = [];
            let source = 'database';

            // Helper: fetch all users from GHL (handles pagination, max 100 per page)
            const fetchGhlUsers = async (token: string, label: string): Promise<any[] | null> => {
                const allUsers: any[] = [];
                let skip = 0;
                const limit = 100;
                try {
                    while (true) {
                        const response = await fetch(
                            `https://services.leadconnectorhq.com/users/?locationId=${ghlLocationId}&limit=${limit}&skip=${skip}`,
                            { headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-07-28' } }
                        );
                        if (!response.ok) {
                            console.warn(`GHL API (${label}) failed: ${response.status}`);
                            return null;
                        }
                        const data = await response.json();
                        const users = data.users || [];
                        allUsers.push(...users);
                        console.log(`GHL (${label}): fetched ${users.length} users (skip=${skip}, total so far=${allUsers.length})`);
                        if (users.length < limit) break; // No more pages
                        skip += limit;
                    }
                    return allUsers;
                } catch (err) {
                    console.warn(`GHL API (${label}) error:`, err.message);
                    return null;
                }
            };

            // Try agency API key first (never expires)
            const agencyApiKey = Deno.env.get('GHL_AGENCY_API_KEY');
            if (agencyApiKey) {
                const rawUsers = await fetchGhlUsers(agencyApiKey, 'agency key');
                if (rawUsers) {
                    ghlUsers = rawUsers.map((u: any) => ({
                        id: u.id,
                        name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                        firstName: u.firstName,
                        lastName: u.lastName,
                        email: u.email,
                        role: u.role,
                        type: u.type,
                    }));
                    source = 'ghl_api';
                }
            }

            // Fallback: try OAuth token if agency key failed
            if (source === 'database') {
                const accessToken = await getAccessToken(supabaseAdmin, firmId);
                if (accessToken) {
                    const rawUsers = await fetchGhlUsers(accessToken, 'OAuth token');
                    if (rawUsers) {
                        ghlUsers = rawUsers.map((u: any) => ({
                            id: u.id,
                            name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                            firstName: u.firstName,
                            lastName: u.lastName,
                            email: u.email,
                            role: u.role,
                            type: u.type,
                        }));
                        source = 'ghl_api';
                    }
                }
            }

            // Sync live GHL data back to users table for future fallback
            if (source === 'ghl_api') {
                for (const u of ghlUsers) {
                    const payload: Record<string, any> = {
                        id: u.id,
                        email: u.email,
                        firstName: u.firstName,
                        lastName: u.lastName,
                        name: u.name,
                        locationId: ghlLocationId,
                    };
                    if (u.phone) payload.phone = u.phone;
                    if (u.roles) payload.roles = u.roles;
                    if (u.companyId) payload.companyId = u.companyId;
                    await supabaseAdmin.from('users').upsert(payload, { onConflict: 'id' });
                }
            }

            // Last resort: read from our own users table
            if (source === 'database') {
                const { data: dbUsers, error: usersError } = await supabaseAdmin
                    .from('users')
                    .select('id, email, firstName, lastName, name, roles')
                    .eq('locationId', ghlLocationId)

                if (usersError) {
                    console.error("Failed to query users table:", usersError.message);
                    throw new Error('Failed to load CRM users.');
                }

                ghlUsers = (dbUsers || []).map((u: any) => ({
                    id: u.id,
                    name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                    firstName: u.firstName,
                    lastName: u.lastName,
                    email: u.email,
                    role: u.roles?.type || u.roles?.role || null,
                    type: null,
                }));
                console.log(`Loaded ${ghlUsers.length} users from database fallback`);
            }

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

            // Enrich users with hasAccess flag
            const enrichedUsers = ghlUsers.map((u: any) => ({
                ...u,
                hasAccess: staffEmails.has(u.email?.toLowerCase()) || !!staffByGhlId[u.id],
                appRole: staffByGhlId[u.id]?.role || (existingStaff || []).find((s: any) => s.email?.toLowerCase() === u.email?.toLowerCase())?.role || null,
            }));

            return new Response(
                JSON.stringify({ users: enrichedUsers, source }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // GRANT ACCESS: Create auth user + staff record (or reactivate)
        if (action === 'grant') {
            const { ghlUserId, email, name, role } = body;

            if (!email) throw new Error('Email is required');

            // Check if staff already exists at this firm (active or inactive)
            const { data: existingStaff } = await supabaseAdmin
                .from('staff')
                .select('staff_id, is_active')
                .eq('email', email.toLowerCase())
                .eq('firm_id', firmId)
                .maybeSingle();

            if (existingStaff?.is_active) {
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

            if (existingStaff) {
                // Reactivate the previously revoked staff record
                const { error: reactivateError } = await supabaseAdmin
                    .from('staff')
                    .update({
                        is_active: true,
                        full_name: name,
                        role: (role && role !== 'Firm Owner') ? role : 'Tax Pro',
                        auth_user_id: userRecord?.id || null,
                        ghl_user_id: ghlUserId || null,
                        ghl_location_id: ghlLocationId,
                    })
                    .eq('staff_id', existingStaff.staff_id);

                if (reactivateError) throw reactivateError;
            } else {
                // Create new staff record
                const { error: staffInsertError } = await supabaseAdmin
                    .from('staff')
                    .insert({
                        firm_id: firmId,
                        email: email.toLowerCase(),
                        full_name: name,
                        role: (role && role !== 'Firm Owner') ? role : 'Tax Pro',
                        auth_user_id: userRecord?.id || null,
                        is_active: true,
                        ghl_user_id: ghlUserId || null,
                        ghl_location_id: ghlLocationId,
                    });

                if (staffInsertError) throw staffInsertError;
            }

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

        // UPDATE ROLE: Change a staff member's role (admin-only, bypasses RLS)
        if (action === 'update-role') {
            const { staffId, role } = body;
            if (!staffId || !role) throw new Error('staffId and role are required');

            // Prevent setting anyone as Firm Owner through this action
            if (role === 'Firm Owner') throw new Error('Firm Owner role cannot be assigned manually');

            const { error } = await supabaseAdmin
                .from('staff')
                .update({ role })
                .eq('staff_id', staffId)
                .eq('firm_id', firmId);

            if (error) throw error;

            return new Response(
                JSON.stringify({ message: 'Role updated successfully' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        throw new Error('Invalid action. Use ?action=list, ?action=grant, ?action=revoke, or ?action=update-role')

    } catch (error) {
        console.error("crm-users error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
