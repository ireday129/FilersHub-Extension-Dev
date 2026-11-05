import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function allowedOrigins(): string[] {
  return [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'https://dev.filershub.com',
    'chrome-extension://',
  ];
}

function corsOriginFor(req: Request): string {
  const allowed = allowedOrigins();
  const origin = req.headers.get('origin') || '';
  if (allowed.some((a) => origin.startsWith(a))) return origin;
  if (origin.includes('gohighlevel.com') || origin.includes('leadconnectorhq.com')) return origin;
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
async function requireStaff(
  admin: SupabaseClient,
  req: Request,
  firmId: string,
  role: string | null,
  deniedMessage: string,
): Promise<{ userId: string } | Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^bearer\s+/i, '').trim();
  if (!jwt) return json(req, { error: 'Please sign in.' }, 401);

  const { data, error } = await admin.auth.getUser(jwt);
  const userId = data?.user?.id;
  if (error || !userId) return json(req, { error: 'Please sign in.' }, 401);

  let query = admin
    .from('staff')
    .select('staff_id')
    .eq('auth_user_id', userId)
    .eq('firm_id', firmId)
    .eq('is_active', true);
  if (role) query = query.eq('role', role);
  const { data: staff, error: staffError } = await query.limit(1).maybeSingle();
  if (staffError) {
    return json(req, { error: 'Could not check your firm access. Try again.' }, 500);
  }
  if (!staff) return json(req, { error: deniedMessage }, 403);
  return { userId };
}

/** Signed-in active Firm Owner of firmId, or an error Response. */
export function requireFirmOwner(
  admin: SupabaseClient,
  req: Request,
  firmId: string,
): Promise<{ userId: string } | Response> {
  return requireStaff(admin, req, firmId, 'Firm Owner', 'Only the firm owner can manage the GHL connection.');
}

/** Signed-in active staff (any role) of firmId, or an error Response. */
export function requireFirmStaff(
  admin: SupabaseClient,
  req: Request,
  firmId: string,
): Promise<{ userId: string } | Response> {
  return requireStaff(admin, req, firmId, null, 'Your FilersHub login is not staff of the firm connected to this GHL sub-account.');
}
