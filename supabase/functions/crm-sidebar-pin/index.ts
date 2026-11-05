// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'https://dev.filershub.com',
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
};

import { getConnection, agencyRequest, filersHubAgencyId } from '../_shared/ghl.ts';
import { isFilersHubAgency, menuLinkPayload, findFirmMenuLink } from '../_shared/ghl-core.ts';

const json = (body: unknown, status: number, headers: Record<string, string>) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

// Shared gate: needs a connection in the FilersHub agency. Returns the connection or an error Response.
async function requireAgencyConnection(admin, firmId: string, headers: Record<string, string>) {
    const conn = await getConnection(admin, firmId);
    if (!conn) return { error: json({ error: 'Connect GHL in Settings first.' }, 400, headers) };
    if (!isFilersHubAgency(conn.companyId, filersHubAgencyId())) {
        return {
            error: json({
                error: 'This only works automatically for sub-accounts in the FilersHub agency. Settings shows how your agency admin can set it up.',
                code: 'OTHER_AGENCY',
            }, 400, headers),
        };
    }
    return { conn };
}

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization') } } }
        );

        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Unauthorized — no active session');

        const { firmId, action } = await req.json();
        if (!firmId) {
            return new Response(
                JSON.stringify({ error: 'firmId is required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!action || !['pin', 'unpin'].includes(action)) {
            return new Response(
                JSON.stringify({ error: 'action must be "pin" or "unpin"' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify caller is Firm Owner
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('firm_id, role')
            .eq('auth_user_id', user.id)
            .eq('firm_id', firmId)
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffData || staffData.role !== 'Firm Owner') {
            throw new Error('Only firm owners can manage sidebar pinning');
        }

        // Fetch firm details
        const { data: firmData, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('subscription_tier, firm_name')
            .eq('firm_id', firmId)
            .single();

        if (firmError) throw new Error(`Firm lookup failed: ${firmError.message}`);
        if (!firmData) throw new Error('Firm not found');

        // Check Pro tier
        const isPro = firmData.subscription_tier === 'Pro';
        if (!isPro) {
            return new Response(
                JSON.stringify({ error: 'Sidebar pinning is available for Pro plans and above' }),
                { status: 403, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const gate = await requireAgencyConnection(supabaseAdmin, firmId, requestCorsHeaders);
        if (gate.error) return gate.error;
        const conn = gate.conn;

        const listResp = await agencyRequest('/custom-menus/');
        if (!listResp.ok) {
            console.error(`GET /custom-menus/ failed (${listResp.status}):`, await listResp.text());
            return json({ error: 'Could not read the GHL sidebar links. Try again.' }, 502, requestCorsHeaders);
        }
        const listData = await listResp.json();
        const menus = listData.customMenus ?? listData.data ?? [];
        const existing = findFirmMenuLink(menus, conn.locationId);

        if (action === 'pin') {
            if (existing) {
                return json({ success: true, action: 'already_pinned', menuId: existing.id }, 200, requestCorsHeaders);
            }

            const appUrl = Deno.env.get('APP_URL') || 'https://app.filershub.com';
            const createResp = await agencyRequest('/custom-menus/', {
                method: 'POST',
                body: JSON.stringify(menuLinkPayload(appUrl, conn.locationId)),
            });

            if (!createResp.ok) {
                const errText = await createResp.text();
                console.error(`POST /custom-menus/ failed (${createResp.status}):`, errText);
                throw new Error(`Failed to create sidebar link (status ${createResp.status})`);
            }

            const createData = await createResp.json();
            return json({ success: true, action: 'pinned', menuId: createData.id }, 200, requestCorsHeaders);
        }

        if (action === 'unpin') {
            if (existing) {
                const deleteResp = await agencyRequest(`/custom-menus/${existing.id}`, { method: 'DELETE' });
                if (!deleteResp.ok) {
                    const errText = await deleteResp.text();
                    console.error(`DELETE /custom-menus/${existing.id} failed:`, errText);
                    throw new Error('Failed to remove sidebar link');
                }
            }

            return json({ success: true, action: 'unpinned' }, 200, requestCorsHeaders);
        }

    } catch (error) {
        console.error('crm-sidebar-pin error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
