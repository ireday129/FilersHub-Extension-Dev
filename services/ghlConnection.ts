import { supabase } from './supabase';

export interface GhlConnectionStatus {
  connected: boolean;
  status: 'ok' | 'broken' | null;
  locationId: string | null;
  locationName: string | null;
  companyId: string | null;
  isFilersHubAgency: boolean;
  tokenAddedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  actionsUrl: string;
  suggestedLocationId: string | null;
}

// Mirrors Settings' getFreshToken(): refresh first, fall back to the existing session.
async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.refreshSession();
  if (session?.access_token) return session.access_token;
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing?.access_token) return existing.access_token;
  throw new Error('Your session has expired. Please sign out and sign back in.');
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke('ghl-connection', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (data?.error) throw new Error(data.error);
  if (error) {
    let detail = '';
    try {
      const ctx = await (error as any).context?.json();
      if (ctx?.error) detail = ctx.error;
    } catch (_) { /* no parseable context */ }
    throw new Error(detail || error.message || 'Edge function error');
  }
  return data as T;
}

export const getGhlStatus = (firmId: string) =>
  call<GhlConnectionStatus>({ action: 'status', firmId });

export const connectGhl = (firmId: string, locationId: string, token: string) =>
  call<GhlConnectionStatus>({ action: 'connect', firmId, locationId, token });

export const disconnectGhl = (firmId: string) =>
  call<GhlConnectionStatus>({ action: 'disconnect', firmId });

export const revealActionsSecret = async (firmId: string): Promise<string> =>
  (await call<{ secret: string }>({ action: 'reveal-actions-secret', firmId })).secret;

export const regenerateActionsSecret = async (firmId: string): Promise<string> =>
  (await call<{ secret: string }>({ action: 'regenerate-actions-secret', firmId })).secret;
