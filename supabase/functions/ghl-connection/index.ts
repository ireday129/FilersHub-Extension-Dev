import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FUNCTIONS_PUBLIC_URL,
  GHL_API_BASE,
  describeGhlFailure,
  generateSecret,
  ghlHeaders,
  isFilersHubAgency,
  normalizeLocationId,
  normalizeToken,
} from '../_shared/ghl-core.ts';
import {
  adminClient,
  filersHubAgencyId,
  getConnection,
  vaultDelete,
  vaultStore,
} from '../_shared/ghl.ts';
import type { GhlConnection } from '../_shared/ghl.ts';
import { corsHeadersFor, json, requireFirmOwner } from '../_shared/http.ts';

const ACTIONS_URL = `${FUNCTIONS_PUBLIC_URL}/crm-actions`;

async function suggestedLocationFor(admin: SupabaseClient, firmId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('firms')
    .select('ghl_location_id')
    .eq('firm_id', firmId)
    .maybeSingle();
  if (error) throw new Error(`Could not load firm: ${error.message}`);
  return (data?.ghl_location_id as string | null | undefined) ?? null;
}

async function buildStatus(admin: SupabaseClient, firmId: string) {
  const conn = await getConnection(admin, firmId);
  const suggestedLocationId = await suggestedLocationFor(admin, firmId);
  if (!conn) {
    return {
      connected: false,
      status: null,
      locationId: null,
      locationName: null,
      companyId: null,
      isFilersHubAgency: false,
      tokenAddedAt: null,
      lastCheckedAt: null,
      lastError: null,
      actionsUrl: ACTIONS_URL,
      suggestedLocationId,
    };
  }
  return {
    connected: true,
    status: conn.status,
    locationId: conn.locationId,
    locationName: conn.location_name,
    companyId: conn.companyId,
    isFilersHubAgency: isFilersHubAgency(conn.companyId, filersHubAgencyId()),
    tokenAddedAt: conn.token_added_at,
    lastCheckedAt: conn.last_checked_at,
    lastError: conn.last_error,
    actionsUrl: ACTIONS_URL,
    suggestedLocationId,
  };
}

async function ghlGet(token: string, path: string): Promise<Response> {
  return await fetch(`${GHL_API_BASE}${path}`, { headers: ghlHeaders(token), signal: AbortSignal.timeout(15000) });
}

async function connect(
  req: Request,
  admin: SupabaseClient,
  firmId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const locationId = normalizeLocationId(String(body.locationId ?? ''));
  const token = normalizeToken(String(body.token ?? ''));
  if (!locationId) {
    return json(req, {
      error: 'Enter the sub-account Location ID (or paste the GHL web address of the sub-account).',
    }, 400);
  }
  if (!token) return json(req, { error: 'Paste the Private Integration token.' }, 400);

  const conflictMessage = 'This GHL sub-account is already connected to another FilersHub firm.';
  const { data: otherConn, error: connErr } = await admin
    .from('ghl_connections')
    .select('firm_id')
    .eq('locationId', locationId)
    .neq('firm_id', firmId)
    .limit(1);
  if (connErr) throw new Error(connErr.message);
  if (otherConn && otherConn.length > 0) return json(req, { error: conflictMessage }, 409);

  const { data: otherFirm, error: firmErr } = await admin
    .from('firms')
    .select('firm_id')
    .eq('ghl_location_id', locationId)
    .neq('firm_id', firmId)
    .limit(1);
  if (firmErr) throw new Error(firmErr.message);
  if (otherFirm && otherFirm.length > 0) return json(req, { error: conflictMessage }, 409);

  const encLoc = encodeURIComponent(locationId);

  const locResp = await ghlGet(token, `/locations/${encLoc}`);
  const locText = await locResp.text();
  if (!locResp.ok) {
    return json(req, {
      error: 'GHL refused the token: ' + describeGhlFailure(locResp.status, locText).message,
    }, 400);
  }
  let locBody: Record<string, any> = {};
  try {
    locBody = JSON.parse(locText) as Record<string, any>;
  } catch {
    // unparseable body: no name or company
  }
  const loc = (locBody?.location ?? locBody ?? {}) as Record<string, any>;
  const companyId = typeof loc.companyId === 'string' && loc.companyId ? loc.companyId : null;
  const locationName = typeof loc.name === 'string' && loc.name ? loc.name : null;

  const contactsResp = await ghlGet(token, `/contacts/?locationId=${encLoc}&limit=1`);
  const contactsText = await contactsResp.text();
  if (!contactsResp.ok) {
    if (contactsResp.status === 401 || contactsResp.status === 403) {
      return json(req, { error: 'The token is missing the contacts.readonly scope.' }, 400);
    }
    return json(req, {
      error: 'GHL refused the token: ' + describeGhlFailure(contactsResp.status, contactsText).message,
    }, 400);
  }

  const usersResp = await ghlGet(token, `/users/?locationId=${encLoc}`);
  const usersText = await usersResp.text();
  if (!usersResp.ok) {
    if (usersResp.status === 401 || usersResp.status === 403) {
      return json(req, { error: 'The token is missing the users.readonly scope.' }, 400);
    }
    return json(req, {
      error: 'GHL refused the token: ' + describeGhlFailure(usersResp.status, usersText).message,
    }, 400);
  }

  const existing = await getConnection(admin, firmId);
  const tokenSecretId = await vaultStore(admin, `ghl_pit_${firmId}`, token);
  const actionsSecretId = existing?.actions_secret_id
    ?? await vaultStore(admin, `ghl_actions_${firmId}`, generateSecret());

  const now = new Date().toISOString();
  const { error: upsertErr } = await admin.from('ghl_connections').upsert({
    firm_id: firmId,
    locationId,
    companyId,
    location_name: locationName,
    token_secret_id: tokenSecretId,
    actions_secret_id: actionsSecretId,
    status: 'ok',
    last_error: null,
    last_checked_at: now,
    token_added_at: now,
    updated_at: now,
  }, { onConflict: 'firm_id' });
  if (upsertErr) throw new Error(upsertErr.message);

  const { error: firmUpdErr } = await admin
    .from('firms')
    .update({ ghl_location_id: locationId })
    .eq('firm_id', firmId);
  if (firmUpdErr) throw new Error(firmUpdErr.message);

  return json(req, await buildStatus(admin, firmId));
}

async function disconnect(req: Request, admin: SupabaseClient, firmId: string): Promise<Response> {
  const conn = await getConnection(admin, firmId);
  if (conn) {
    if (conn.token_secret_id) await vaultDelete(admin, conn.token_secret_id);
    if (conn.actions_secret_id) await vaultDelete(admin, conn.actions_secret_id);
    const { error } = await admin.from('ghl_connections').delete().eq('firm_id', firmId);
    if (error) throw new Error(error.message);
  }
  return json(req, await buildStatus(admin, firmId));
}

async function actionsSecret(
  req: Request,
  admin: SupabaseClient,
  firmId: string,
  conn: GhlConnection | null,
  regenerate: boolean,
): Promise<Response> {
  if (!conn) return json(req, { error: 'Connect GHL first.' }, 400);
  if (!regenerate && conn.actions_secret_id) {
    const { data, error } = await admin.rpc('ghl_vault_read', { p_id: conn.actions_secret_id });
    if (error) throw new Error(error.message);
    if (data) return json(req, { secret: data as string });
  }
  const secret = generateSecret();
  const id = await vaultStore(admin, `ghl_actions_${firmId}`, secret);
  const { error } = await admin
    .from('ghl_connections')
    .update({ actions_secret_id: id, updated_at: new Date().toISOString() })
    .eq('firm_id', firmId);
  if (error) throw new Error(error.message);
  return json(req, { secret });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(req, { error: 'firmId is required.' }, 400);
  }
  const firmId = typeof body?.firmId === 'string' ? body.firmId.trim() : '';
  if (!firmId) return json(req, { error: 'firmId is required.' }, 400);

  const action = String(body.action ?? '');
  const known = ['status', 'connect', 'disconnect', 'reveal-actions-secret', 'regenerate-actions-secret'];
  if (!known.includes(action)) return json(req, { error: 'Unknown action.' }, 400);

  try {
    const admin = adminClient();
    const auth = await requireFirmOwner(admin, req, firmId);
    if (auth instanceof Response) return auth;

    switch (action) {
      case 'status':
        return json(req, await buildStatus(admin, firmId));
      case 'connect':
        return await connect(req, admin, firmId, body);
      case 'disconnect':
        return await disconnect(req, admin, firmId);
      case 'reveal-actions-secret':
        return await actionsSecret(req, admin, firmId, await getConnection(admin, firmId), false);
      default:
        return await actionsSecret(req, admin, firmId, await getConnection(admin, firmId), true);
    }
  } catch (e) {
    console.error('ghl-connection failed:', e instanceof Error ? e.message : 'unknown error');
    return json(req, { error: 'Something went wrong. Try again.' }, 500);
  }
});
