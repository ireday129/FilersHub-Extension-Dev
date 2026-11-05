import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GHL_API_BASE,
  buildStatusUpdate,
  describeGhlFailure,
  ghlHeaders,
} from './ghl-core.ts';

export type ConnectionStatus = 'ok' | 'broken';

export interface GhlConnection {
  firm_id: string;
  locationId: string;
  companyId: string | null;
  location_name: string | null;
  token_secret_id: string | null;
  actions_secret_id: string | null;
  status: ConnectionStatus;
  last_error: string | null;
  last_checked_at: string | null;
  token_added_at: string | null;
}

export class GhlNotConnectedError extends Error {
  constructor() {
    super('FilersHub is not connected to GHL for this firm. Connect it in Settings.');
    this.name = 'GhlNotConnectedError';
  }
}

const CONNECTION_COLUMNS =
  'firm_id, locationId, companyId, location_name, token_secret_id, actions_secret_id, status, last_error, last_checked_at, token_added_at';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

export async function getConnection(admin: SupabaseClient, firmId: string): Promise<GhlConnection | null> {
  const { data, error } = await admin
    .from('ghl_connections')
    .select(CONNECTION_COLUMNS)
    .eq('firm_id', firmId)
    .maybeSingle();
  if (error) throw new Error(`Could not load GHL connection: ${error.message}`);
  return (data as GhlConnection | null) ?? null;
}

export async function getConnectionByLocation(
  admin: SupabaseClient,
  locationId: string,
): Promise<GhlConnection | null> {
  const { data, error } = await admin
    .from('ghl_connections')
    .select(CONNECTION_COLUMNS)
    .eq('locationId', locationId)
    .maybeSingle();
  if (error) throw new Error(`Could not load GHL connection: ${error.message}`);
  return (data as GhlConnection | null) ?? null;
}

export async function vaultStore(admin: SupabaseClient, name: string, secret: string): Promise<string> {
  const { data, error } = await admin.rpc('ghl_vault_store', { p_name: name, p_secret: secret });
  if (error || !data) throw new Error(`Could not store secret: ${error?.message ?? 'no id returned'}`);
  return data as string;
}

export async function vaultRead(admin: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await admin.rpc('ghl_vault_read', { p_id: id });
  if (error) throw new Error(`Could not read secret: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function vaultDelete(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.rpc('ghl_vault_delete', { p_id: id });
  if (error) throw new Error(`Could not delete secret: ${error.message}`);
}

export async function setConnectionHealth(
  admin: SupabaseClient,
  firmId: string,
  health: { ok: true } | { ok: false; message: string },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('ghl_connections')
    .update({
      status: health.ok ? 'ok' : 'broken',
      last_error: health.ok ? null : health.message,
      last_checked_at: now,
      updated_at: now,
    })
    .eq('firm_id', firmId);
  if (error) throw new Error(`Could not update GHL connection health: ${error.message}`);
}

export interface FirmGhl {
  firmId: string;
  locationId: string;
  companyId: string | null;
  request(path: string, init?: RequestInit): Promise<Response>;
}

export async function firmGhl(admin: SupabaseClient, firmId: string): Promise<FirmGhl> {
  const conn = await getConnection(admin, firmId);
  if (!conn || !conn.token_secret_id) throw new GhlNotConnectedError();
  const token = await vaultRead(admin, conn.token_secret_id);
  if (!token) throw new GhlNotConnectedError();

  const wasBroken = conn.status === 'broken';

  return {
    firmId,
    locationId: conn.locationId,
    companyId: conn.companyId,
    async request(path: string, init?: RequestInit): Promise<Response> {
      const resp = await fetch(`${GHL_API_BASE}${path}`, {
        ...init,
        headers: {
          ...ghlHeaders(token, !!init?.body),
          ...(init?.headers as Record<string, string> | undefined),
        },
      });
      try {
        if (!resp.ok) {
          const failure = describeGhlFailure(resp.status, await resp.clone().text());
          if (failure.broken) {
            await setConnectionHealth(admin, firmId, { ok: false, message: failure.message });
          }
        } else if (wasBroken) {
          await setConnectionHealth(admin, firmId, { ok: true });
        }
      } catch (e) {
        console.error('GHL health update failed:', e instanceof Error ? e.message : e);
      }
      return resp;
    },
  };
}

export async function agencyRequest(path: string, init?: RequestInit): Promise<Response> {
  const key = Deno.env.get('GHL_AGENCY_API_KEY');
  if (!key) throw new Error('Agency API key not configured.');
  return fetch(`${GHL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...ghlHeaders(key, !!init?.body),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export function filersHubAgencyId(): string | null {
  return Deno.env.get('GHL_AGENCY_COMPANY_ID') || null;
}

export async function syncContactStatus(
  ghl: FirmGhl,
  contactId: string,
  status: string,
  customFieldName: string | null,
): Promise<void> {
  const id = encodeURIComponent(contactId);
  const getResp = await ghl.request(`/contacts/${id}`);
  const getText = await getResp.text();
  if (!getResp.ok) throw new Error(describeGhlFailure(getResp.status, getText).message);

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(getText) as { contact?: { tags?: unknown } };
    const t = parsed?.contact?.tags;
    if (Array.isArray(t)) tags = t as string[];
  } catch {
    // unparseable body: treat as no tags
  }

  const putResp = await ghl.request(`/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(buildStatusUpdate(tags, status, customFieldName)),
  });
  if (!putResp.ok) {
    throw new Error(describeGhlFailure(putResp.status, await putResp.text()).message);
  }
}
