// Lists the FilersHub tax returns of the client linked to one GHL contact, for
// the returns panel in GHL contact cards (public/ghl-contact-button.js). Same
// access rule as ghl-sync-contact: active staff of the firm connected to that
// sub-account, or a platform Super Admin. Read-only; never calls GHL.
import { NO_LOCATION_ACCESS, normalizeContactId, normalizeLocationId } from '../_shared/ghl-core.ts';
import { adminClient, getConnectionByLocation } from '../_shared/ghl.ts';
import { findClientByContactId } from '../_shared/clients.ts';
import { authenticate, corsHeadersFor, isActiveStaff, json } from '../_shared/http.ts';

interface ReturnRow {
  return_id: string;
  tax_year: string | null;
  return_type: string | null;
  tax_return_status: string | null;
  updated_at: string | null;
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
    const contactId = normalizeContactId(body?.contactId);
    if (!locationId || !contactId) {
      return json(req, { error: 'Missing GHL location or contact.' }, 400);
    }

    const conn = await getConnectionByLocation(admin, locationId);
    if (!conn || !(auth.superAdmin || await isActiveStaff(admin, auth.userId, conn.firm_id))) {
      return json(req, { error: NO_LOCATION_ACCESS }, 403);
    }

    const found = await findClientByContactId(admin, conn.firm_id, contactId);
    if (found.error) throw new Error(found.error);
    if (!found.client) return json(req, { linked: false, returns: [] });

    const { data, error } = await admin
      .from('tax_returns')
      .select('return_id, tax_year, return_type, tax_return_status, updated_at')
      .eq('firm_id', conn.firm_id)
      .eq('client_id', found.client.client_id)
      .order('tax_year', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`Returns lookup failed: ${error.message}`);

    return json(req, {
      linked: true,
      clientName: found.client.full_name,
      returns: ((data ?? []) as ReturnRow[]).map((r) => ({
        returnId: r.return_id,
        taxYear: r.tax_year ?? '',
        returnType: r.return_type ?? '',
        status: r.tax_return_status ?? '',
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    console.error('ghl-contact-returns failed:', e instanceof Error ? e.message : 'unknown error');
    return json(req, { error: "Couldn't load tax returns. Try again." }, 500);
  }
});
