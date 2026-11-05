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
import { isFilersHubAgency } from '../_shared/ghl-core.ts';

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
        // User-scoped client (for auth)
        const supabaseClient = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization') } } }
        );

        // Admin client (for DB operations)
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Unauthorized — no active session');

        const { firmId, logoUrl, brandColor } = await req.json();
        if (!firmId) {
            return new Response(
                JSON.stringify({ error: 'firmId is required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!logoUrl && !brandColor) {
            return new Response(
                JSON.stringify({ error: 'logoUrl or brandColor is required' }),
                { status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Verify caller is Firm Owner
        const { data: staffData, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('firm_id, role')
            .eq('auth_user_id', user.id)
            .eq('firm_id', firmId)
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffData || staffData.role !== 'Firm Owner') {
            throw new Error('Only firm owners can sync logos to CRM');
        }

        // 2. Shared gate: connected and in the FilersHub agency
        const gate = await requireAgencyConnection(supabaseAdmin, firmId, requestCorsHeaders);
        if (gate.error) return gate.error;
        const locationId = gate.conn.locationId;

        // Strip cache-busting param for a clean URL
        const cleanLogoUrl = logoUrl ? logoUrl.split('?')[0] : null;

        // Build the location update payload
        const locationPayload: Record<string, any> = {};
        if (cleanLogoUrl) locationPayload.logoUrl = cleanLogoUrl;

        // Build settings object for brand color
        if (brandColor) {
            locationPayload.settings = {
                primaryColor: brandColor,
            };
        }

        console.log(`Syncing to GHL location ${locationId}:`, JSON.stringify(locationPayload));

        const putResp = await agencyRequest(`/locations/${locationId}`, {
            method: 'PUT',
            body: JSON.stringify(locationPayload),
        });

        if (putResp.ok) {
            console.log(`Branding synced to GHL location ${locationId} via PUT /locations`);
            return new Response(
                JSON.stringify({
                    success: true,
                    method: 'location_update',
                    message: 'Branding synced to CRM location',
                }),
                { headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const putErrorText = await putResp.text();
        console.error(`PUT /locations/${locationId} failed (${putResp.status}):`, putErrorText);
        throw new Error(`Failed to sync branding to GHL (status ${putResp.status}). Try again or contact support.`);

    } catch (error) {
        console.error('crm-logo-sync error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
