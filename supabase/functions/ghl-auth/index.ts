
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

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
            const firmId = url.searchParams.get('firmId') || body.firmId
            if (!firmId) throw new Error('Missing firmId')

            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const redirectUri = `${url.origin}/functions/v1/ghl-auth/callback`

            // Scopes: contacts.readonly, locations.readonly is a good start
            // Note: GHL scopes are space-separated
            const scopes = 'contacts.readonly contacts.write locations.readonly users.readonly'

            // State = firmId (to know who is connecting)
            const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${redirectUri}&client_id=${clientId}&scope=${scopes}&state=${firmId}`

            return new Response(JSON.stringify({ url: authUrl }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. CALLBACK: Handle Code Exchange
        if (pathname.endsWith('/callback')) {
            const code = url.searchParams.get('code')
            const firmId = url.searchParams.get('state') // We passed firmId as state

            if (!code || !firmId) {
                return new Response("Missing code or state", { status: 400 })
            }

            // Exchange Code for Token
            const clientId = Deno.env.get('GHL_CLIENT_ID')
            const clientSecret = Deno.env.get('GHL_CLIENT_SECRET')

            // In production, this redirect URI must exactly match the GHL App settings
            // For local dev with Supabase CLI it might differ, but assuming deployed usage:
            const redirectUri = `${url.origin}/functions/v1/ghl-auth/callback`

            const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                    user_type: 'Location' // Assuming we connect single locations for V1
                })
            })

            const tokenData = await tokenResponse.json()

            if (!tokenResponse.ok) {
                console.error('Token Error:', tokenData)
                return new Response(`Error connecting to GHL: ${tokenData.error_description}`, { status: 400 })
            }

            // Store in DB
            // We need Service Role Key to bypass RLS for writing tokens (if strict)
            // or to ensure we can write to the integrations table securely
            const supabaseAdmin = createClient(
                Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )

            // Calculate expiry
            // expires_in is seconds
            const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()

            const { error: dbError } = await supabaseAdmin
                .from('integrations_ghl')
                .upsert({
                    firm_id: firmId,
                    location_id: tokenData.locationId,
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                    token_expires_at: expiresAt,
                    user_type: tokenData.userType,
                    scope: tokenData.scope,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'firm_id' })

            if (dbError) {
                console.error('DB Error:', dbError)
                return new Response("Database error saving integration", { status: 500 })
            }

            // Redirect back to App Settings with success query param
            // Note: In Extension environment, deep linking is tricky.
            // We'll redirect to a generic success page or the app URL if known.
            // For now, redirecting to the main app URL assumed to be configured.
            const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
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
