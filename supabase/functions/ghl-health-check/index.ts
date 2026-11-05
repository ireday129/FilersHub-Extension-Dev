import { adminClient, firmGhl, setConnectionHealth } from '../_shared/ghl.ts';
import { secretsMatch } from '../_shared/ghl-core.ts';
import { corsHeadersFor, json } from '../_shared/http.ts';

interface GhlUser {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

function userName(u: GhlUser): string {
  const name = (u.name ?? '').trim();
  if (name) return name;
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

  const expected = Deno.env.get('CRON_SECRET') ?? '';
  if (!secretsMatch(expected, req.headers.get('x-cron-secret') ?? '')) {
    return json(req, { error: 'Unauthorized' }, 401);
  }

  const admin = adminClient();
  const { data: rows, error } = await admin.from('ghl_connections').select('firm_id, "locationId"');
  if (error) {
    console.error('ghl-health-check: could not list connections:', error.message);
    return json(req, { error: 'Could not list connections.' }, 500);
  }

  let ok = 0;
  let broken = 0;
  const connections = (rows ?? []) as { firm_id: string; locationId: string }[];

  for (const row of connections) {
    const firmId = row.firm_id;
    try {
      const ghl = await firmGhl(admin, firmId);
      const locId = encodeURIComponent(row.locationId);
      const resp = await ghl.request(`/locations/${locId}`);
      if (!resp.ok) {
        // request() already recorded the failure when it was a "broken" one; make sure last_checked_at is set.
        broken++;
        const now = new Date().toISOString();
        const { error: upErr } = await admin
          .from('ghl_connections')
          .update({ last_checked_at: now, updated_at: now })
          .eq('firm_id', firmId);
        if (upErr) console.error('ghl-health-check: last_checked_at update failed:', firmId, upErr.message);
        continue;
      }

      const body = (await resp.json().catch(() => ({}))) as {
        location?: { name?: string; companyId?: string };
        name?: string;
        companyId?: string;
      };
      const loc = body.location ?? body;
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { last_checked_at: now, updated_at: now };
      if (loc.name) update.location_name = loc.name;
      if (loc.companyId) update.companyId = loc.companyId;
      const { error: upErr } = await admin.from('ghl_connections').update(update).eq('firm_id', firmId);
      if (upErr) console.error('ghl-health-check: connection update failed:', firmId, upErr.message);
      ok++;

      // Best-effort staff name refresh: never affects counts or status.
      try {
        const usersResp = await ghl.request(`/users/?locationId=${locId}`);
        if (!usersResp.ok) {
          console.error('ghl-health-check: users fetch failed:', firmId, usersResp.status);
        } else {
          const usersBody = (await usersResp.json()) as { users?: GhlUser[] };
          for (const u of usersBody.users ?? []) {
            const name = userName(u);
            if (!u.id || !name) continue;
            const { error: sErr } = await admin
              .from('staff')
              .update({ full_name: name })
              .eq('firm_id', firmId)
              .eq('ghl_user_id', u.id);
            if (sErr) console.error('ghl-health-check: staff update failed:', firmId, sErr.message);
          }
        }
      } catch (e) {
        console.error('ghl-health-check: users refresh error:', firmId, e instanceof Error ? e.message : 'unknown');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('ghl-health-check: check failed:', firmId, message);
      broken++;
      try {
        await setConnectionHealth(admin, firmId, { ok: false, message });
      } catch (e2) {
        console.error('ghl-health-check: could not record failure:', firmId, e2 instanceof Error ? e2.message : 'unknown');
      }
    }
  }

  return json(req, { checked: connections.length, ok, broken });
});
