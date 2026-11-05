// Links (or creates) the FilersHub client for one GHL contact, for the
// "Sync to FilersHub" button on GHL contact pages. The caller must be signed
// in to FilersHub as active staff of the firm connected to that sub-account.
import { normalizeLocationId } from '../_shared/ghl-core.ts';
import { adminClient, firmGhl, getConnectionByLocation, GhlNotConnectedError } from '../_shared/ghl.ts';
import { syncContactToClient } from '../_shared/clients.ts';
import { authenticate, corsHeadersFor, isActiveStaff, json } from '../_shared/http.ts';

const CONTACT_ID = /^[A-Za-z0-9]{6,64}$/;

// Same answer for "not connected" and "not your firm", so the reply never
// reveals which GHL sub-accounts belong to other FilersHub firms.
const NO_ACCESS =
  'This GHL sub-account is not connected to a FilersHub firm you belong to. Check that you are signed in with the right FilersHub account.';

// Database details stay in the logs; the person sees a plain message.
function publicError(message: string): string {
  if (/lookup failed|Failed to (create|link) client/i.test(message)) {
    console.error('ghl-sync-contact:', message);
    return 'Could not save the client in FilersHub. Try again.';
  }
  return message;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

  try {
    const admin = adminClient();
    const auth = await authenticate(admin, req);
    if (auth instanceof Response) return auth;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(req, { error: 'Missing GHL location or contact.' }, 400);
    }
    const locationId = normalizeLocationId(String(body?.locationId ?? ''));
    const contactId = String(body?.contactId ?? '').trim();
    if (!locationId || !CONTACT_ID.test(contactId)) {
      return json(req, { error: 'Missing GHL location or contact.' }, 400);
    }

    const conn = await getConnectionByLocation(admin, locationId);
    if (!conn || !(await isActiveStaff(admin, auth.userId, conn.firm_id))) {
      return json(req, { error: NO_ACCESS }, 403);
    }

    let ghl;
    try {
      ghl = await firmGhl(admin, conn.firm_id);
    } catch (e) {
      if (e instanceof GhlNotConnectedError) return json(req, { error: e.message }, 409);
      throw e;
    }

    const result = await syncContactToClient(admin, ghl, conn.firm_id, contactId);
    if (!result.ok) return json(req, { error: publicError(result.error) }, 422);

    const { data: firm } = await admin
      .from('firms')
      .select('firm_name')
      .eq('firm_id', conn.firm_id)
      .maybeSingle();

    return json(req, {
      outcome: result.outcome,
      clientName: result.client.full_name,
      clientEmail: result.client.email,
      firmName: (firm as { firm_name?: string } | null)?.firm_name ?? null,
    });
  } catch (e) {
    console.error('ghl-sync-contact failed:', e instanceof Error ? e.message : 'unknown error');
    return json(req, { error: 'Something went wrong. Try again.' }, 500);
  }
});
