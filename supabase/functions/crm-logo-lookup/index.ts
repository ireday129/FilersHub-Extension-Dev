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

        console.log('crm-logo-lookup: looking up locationId =', locationId);

        const { data: firm, error: dbError } = await supabaseAdmin
            .from('firms')
            .select('logo_url, brand_color, subscription_tier')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        if (dbError) {
            console.error('crm-logo-lookup DB error:', dbError.message, dbError.code);
            return new Response(
                JSON.stringify({ logoUrl: null, brandColor: null, debug: dbError.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('crm-logo-lookup: firm result =', JSON.stringify(firm));

        if (!firm) {
            return new Response(
                JSON.stringify({ logoUrl: null, brandColor: null, debug: 'no firm found for locationId' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Only return branding for Pro plan firms
        const tier = firm.subscription_tier?.toLowerCase();
        const isPro = tier === 'pro' || tier === 'growth' || tier === 'enterprise';
        console.log('crm-logo-lookup: tier =', tier, 'isPro =', isPro);
        if (!isPro) {
            return new Response(
                JSON.stringify({ logoUrl: null, brandColor: null, debug: 'not pro tier: ' + tier }),
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
