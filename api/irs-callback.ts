import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { SignJWT, importPKCS8 } from 'jose';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, state } = req.query;
  const appUrl = process.env.APP_URL || process.env.VERCEL_URL;

  if (!code || !state) {
    return res.redirect(302, `https://${appUrl}/settings?irs_error=missing_params`);
  }

  const userId = String(state);

  try {
    const privateKeyPem = process.env.IRS_PRIVATE_KEY_PEM;
    const clientId = process.env.IRS_CLIENT_ID;
    const kid = process.env.IRS_KID;
    const irsTokenUrl = process.env.IRS_TOKEN_URL || 'https://api.alt.www4.irs.gov/auth/oauth/v2/token';

    if (!privateKeyPem || !clientId || !kid) {
      console.error('[IRS-CALLBACK] Missing required env vars: IRS_PRIVATE_KEY_PEM, IRS_CLIENT_ID, or IRS_KID');
      return res.redirect(302, `https://${appUrl}/settings?irs_error=server_config`);
    }

    // 1. Build client_assertion JWT signed with the X.509 private key
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');

    const clientAssertion = await new SignJWT({
      iss: clientId,
      sub: clientId,
      aud: irsTokenUrl,
      jti: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    // 2. Exchange authorization code for access + refresh tokens
    const redirectUri = `https://${appUrl}/api/irs-callback`;

    const tokenResponse = await fetch(irsTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
        client_id: clientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[IRS-CALLBACK] Token exchange failed:', tokenData);
      return res.redirect(302, `https://${appUrl}/settings?irs_error=token_exchange_failed`);
    }

    console.log(`[IRS-CALLBACK] Token exchange successful for user: ${userId}`);

    // 3. Initialize Supabase Admin client
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. Store tokens in Supabase Vault via RPC
    const { data: accessVaultId, error: accessVaultErr } = await supabaseAdmin.rpc('vault_store_secret', {
      new_secret: tokenData.access_token,
      new_name: `irs_access_${userId}`,
    });

    if (accessVaultErr) {
      console.error('[IRS-CALLBACK] Failed to store access token in Vault:', accessVaultErr);
      return res.redirect(302, `https://${appUrl}/settings?irs_error=vault_error`);
    }

    const { data: refreshVaultId, error: refreshVaultErr } = await supabaseAdmin.rpc('vault_store_secret', {
      new_secret: tokenData.refresh_token,
      new_name: `irs_refresh_${userId}`,
    });

    if (refreshVaultErr) {
      console.error('[IRS-CALLBACK] Failed to store refresh token in Vault:', refreshVaultErr);
      return res.redirect(302, `https://${appUrl}/settings?irs_error=vault_error`);
    }

    // 5. Upsert irs_connections record with Vault references
    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 900) * 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // Refresh token: 1 hour

    const { error: upsertErr } = await supabaseAdmin.from('irs_connections').upsert(
      {
        user_id: userId,
        access_token_vault_id: accessVaultId,
        refresh_token_vault_id: refreshVaultId,
        token_expires_at: tokenExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        irs_user_id: tokenData.irs_user_id || null,
        consent_status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertErr) {
      console.error('[IRS-CALLBACK] Failed to upsert irs_connections:', upsertErr);
      return res.redirect(302, `https://${appUrl}/settings?irs_error=db_error`);
    }

    // 6. Redirect to Settings with success
    return res.redirect(302, `https://${appUrl}/settings?irs_success=true`);
  } catch (error: any) {
    console.error('[IRS-CALLBACK] Internal error:', error);
    return res.redirect(302, `https://${appUrl}/settings?irs_error=internal_error`);
  }
}
