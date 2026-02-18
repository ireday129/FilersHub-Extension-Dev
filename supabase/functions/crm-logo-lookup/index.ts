// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const locationId = url.searchParams.get('locationId');

        if (!locationId) {
            return new Response(
                JSON.stringify({ error: 'locationId is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: firm, error: dbError } = await supabaseAdmin
            .from('firms')
            .select('logo_url, brand_color')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        if (dbError) {
            console.error('crm-logo-lookup DB error:', dbError.message, dbError.code);
            return new Response(
                JSON.stringify({ logoUrl: null, brandColor: null }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!firm) {
            return new Response(
                JSON.stringify({ logoUrl: null, brandColor: null }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Strip cache-busting param from logo URL
        const cleanLogoUrl = firm.logo_url ? firm.logo_url.split('?')[0] : null;

        return new Response(
            JSON.stringify({
                logoUrl: cleanLogoUrl,
                brandColor: firm.brand_color || null,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('crm-logo-lookup error:', error.message);
        return new Response(
            JSON.stringify({ logoUrl: null, brandColor: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
