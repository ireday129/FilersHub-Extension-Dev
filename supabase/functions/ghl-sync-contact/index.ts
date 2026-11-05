// Links (or creates) the FilersHub client for one GHL contact, for the
// "Sync to FilersHub" button on GHL contact pages. The caller must be signed
// in to FilersHub as active staff of the firm connected to that sub-account.
import { normalizeLocationId } from '../_shared/ghl-core.ts';
import { adminClient, firmGhl, getConnectionByLocation, GhlNotConnectedError } from '../_shared/ghl.ts';
import { syncContactToClient } from '../_shared/clients.ts';
import { corsHeadersFor, json, requireFirmStaff } from '../_shared/http.ts';

const CONTACT_ID = /^[A-Za-z0-9]{6,64}$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

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

  try {
    const admin = adminClient();
    const conn = await getConnectionByLocation(admin, locationId);
    if (!conn) return json(req, { error: 'This GHL sub-account is not connected to FilersHub.' }, 404);

    const auth = await requireFirmStaff(admin, req, conn.firm_id);
    if (auth instanceof Response) return auth;

    let ghl;
    try {
      ghl = await firmGhl(admin, conn.firm_id);
    } catch (e) {
      if (e instanceof GhlNotConnectedError) return json(req, { error: e.message }, 409);
      throw e;
    }

    const result = await syncContactToClient(admin, ghl, conn.firm_id, contactId);
    if (!result.ok) return json(req, { error: result.error }, 422);

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
