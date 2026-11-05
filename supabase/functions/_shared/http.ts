import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function allowedOrigins(): string[] {
  return [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'https://dev.filershub.com',
    'chrome-extension://',
  ];
}

const GHL_HOSTS = ['gohighlevel.com', 'leadconnectorhq.com'];

/** Exact origin / hostname matching, so look-alikes such as app.filershub.com.evil.com are refused. */
function corsOriginFor(req: Request): string {
  const allowed = allowedOrigins();
  const origin = req.headers.get('origin') || '';
  if (origin.startsWith('chrome-extension://')) return origin;
  if (allowed.includes(origin)) return origin;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === 'https:' && GHL_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return origin;
    }
  } catch {
    // not a valid origin
  }
  return allowed[0];
}

export function corsHeadersFor(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsOriginFor(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Resolves to the signed-in user if they are active staff of firmId (optionally
 * limited to one role), or to a ready-to-return error Response.
 */
/** Resolves to the signed-in user from the Authorization header, or a 401 Response. */
export async function authenticate(
  admin: SupabaseClient,
  req: Request,
): Promise<{ userId: string } | Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^bearer\s+/i, '').trim();
  if (!jwt) return json(req, { error: 'Please sign in.' }, 401);

  const { data, error } = await admin.auth.getUser(jwt);
  const userId = data?.user?.id;
  if (error || !userId) return json(req, { error: 'Please sign in.' }, 401);
  return { userId };
}

/** Whether userId is active staff of firmId (optionally with one role). Throws on a database error. */
export async function isActiveStaff(
  admin: SupabaseClient,
  userId: string,
  firmId: string,
  role: string | null = null,
): Promise<boolean> {
  let query = admin
    .from('staff')
    .select('staff_id')
    .eq('auth_user_id', userId)
    .eq('firm_id', firmId)
    .eq('is_active', true);
  if (role) query = query.eq('role', role);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`Staff lookup failed: ${error.message}`);
  return !!data;
}

async function requireStaff(
  admin: SupabaseClient,
  req: Request,
  firmId: string,
  role: string | null,
  deniedMessage: string,
): Promise<{ userId: string } | Response> {
  const auth = await authenticate(admin, req);
  if (auth instanceof Response) return auth;
  let allowed: boolean;
  try {
    allowed = await isActiveStaff(admin, auth.userId, firmId, role);
  } catch {
    return json(req, { error: 'Could not check your firm access. Try again.' }, 500);
  }
  if (!allowed) return json(req, { error: deniedMessage }, 403);
  return auth;
}

/** Signed-in active Firm Owner of firmId, or an error Response. */
export function requireFirmOwner(
  admin: SupabaseClient,
  req: Request,
  firmId: string,
): Promise<{ userId: string } | Response> {
  return requireStaff(admin, req, firmId, 'Firm Owner', 'Only the firm owner can manage the GHL connection.');
}

