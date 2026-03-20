import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state') // Contains user_id

        if (!code || !state) {
            return new Response(`<html><script>window.opener?.postMessage({ type: 'IRS_AUTH_ERROR', payload: 'missing_params' }, '*'); window.close();</script></html>`, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } })
        }

        const userId = state;

        // Initialize Supabase Admin
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // TODO: In production, exchange `code` for token via https://api.alt.www4.irs.gov/auth/oauth/v2/token
        // This requires generating a client_assertion JWT signed with the X.509 private key (stored in Vault)
        // Since we are pending IRS Client ID and Certs, we will simulate the token exchange for UI testing.

        console.log(`[IRS-OAUTH] Received authorization code logic for user: ${userId}`);

        // Mock token response for testing Phase 1 UI flow
        const mockAccessToken = "mock_irs_access_token_" + Date.now();
        const mockRefreshToken = "mock_irs_refresh_token_" + Date.now();
        const expiresIn = 900; // 15 minutes
        const refreshExpiresIn = 3600; // 1 hour

        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000).toISOString();

        // Normally we would insert into vault.secrets here via an RPC function, 
        // but for the mock we'll just insert placeholder UUIDs (or actual vault IDs if RPC is used).
        // Let's assume a placeholder UUID for the mock tokens.
        const mockAccessVaultId = "00000000-0000-0000-0000-000000000001";
        const mockRefreshVaultId = "00000000-0000-0000-0000-000000000002";

        const { error: upsertErr } = await supabaseAdmin.from('irs_connections').upsert({
            user_id: userId,
            access_token_vault_id: mockAccessVaultId,
            refresh_token_vault_id: mockRefreshVaultId,
            token_expires_at: tokenExpiresAt,
            refresh_expires_at: refreshExpiresAt,
            irs_user_id: 'mock_irs_user_123',
            consent_status: 'active',
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        if (upsertErr) {
            console.error("Failed to upsert irs_connections:", upsertErr);
            return new Response(`<html><script>window.opener?.postMessage({ type: 'IRS_AUTH_ERROR', payload: 'db_error' }, '*'); window.close();</script></html>`, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } })
        }

        return new Response(`<html><script>window.opener?.postMessage({ type: 'IRS_AUTH_SUCCESS' }, '*'); window.close();</script></html>`, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } })

    } catch (error) {
        console.error("Internal Edge Function Error:", error);
        return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }
})
