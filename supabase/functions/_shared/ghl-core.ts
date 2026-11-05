// Pure GHL helpers. No Deno APIs and no imports, so this runs in Deno edge
// functions, the browser and the Node test runner. Erasable TypeScript only.

export const GHL_API_BASE = 'https://services.leadconnectorhq.com';
export const GHL_API_VERSION = '2021-07-28';
export const FUNCTIONS_PUBLIC_URL = 'https://sb.filershub.com/functions/v1';
export const STATUS_TAG_PREFIX = 'fh-status:';

export const REQUIRED_SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'locations.readonly',
  'users.readonly',
] as const;

export const ACTION_KEYS = [
  'fh_newclientaccess',
  'create_tax_return',
  'search_existing_return',
  'update_return_stage',
  'assign_preparer',
  'add_note',
  'request_docs',
  'set_return_info',
  'deactivate_client',
  'create_task',
] as const;

export type ActionKey = typeof ACTION_KEYS[number];

export function ghlHeaders(token: string, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Version: GHL_API_VERSION,
    Accept: 'application/json',
  };
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

/** Strips a pasted "Bearer " prefix and any whitespace or line breaks. */
export function normalizeToken(input: string): string {
  return String(input ?? '').trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '');
}

/** Accepts a bare location id or a GHL URL containing /location/<id>. Returns '' when invalid. */
export function normalizeLocationId(input: string): string {
  const trimmed = String(input ?? '').trim();
  const fromUrl = trimmed.match(/\/location\/([^/?#\s]+)/);
  const candidate = fromUrl ? fromUrl[1] : trimmed;
  return /^[A-Za-z0-9]{10,40}$/.test(candidate) ? candidate : '';
}

export function bearerFrom(header: string | null): string {
  if (!header) return '';
  return header.replace(/^bearer\s+/i, '').trim();
}

/** Constant-time comparison. Rejects empty and short (<32 char) secrets. */
export function secretsMatch(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  if (expected.length < 32) return false;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function statusTag(status: string): string {
  const slug = String(status ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${STATUS_TAG_PREFIX}${slug}`;
}

/** Replaces any existing fh-status tag with the new one, optionally mirroring it to a custom field. */
export function buildStatusUpdate(
  existingTags: string[],
  status: string,
  customFieldName: string | null,
): { tags: string[]; customFields?: { key: string; field_value: string }[] } {
  const tags = [
    ...existingTags.filter((t) => !t.startsWith(STATUS_TAG_PREFIX)),
    statusTag(status),
  ];
  const result: { tags: string[]; customFields?: { key: string; field_value: string }[] } = { tags };
  if (customFieldName) result.customFields = [{ key: customFieldName, field_value: status }];
  return result;
}

export const SCOPE_ERROR_MESSAGE = `The token is missing a required scope. Required: ${REQUIRED_SCOPES.join(', ')}.`;

export function isScopeError(message: string | null | undefined): boolean {
  return message === SCOPE_ERROR_MESSAGE;
}

export type GhlFailure = { broken: boolean; message: string };

export function describeGhlFailure(httpStatus: number, bodyText: string): GhlFailure {
  if (/not authorized for this scope/i.test(bodyText ?? '')) {
    return {
      broken: true,
      message: SCOPE_ERROR_MESSAGE,
    };
  }
  if (httpStatus === 401) {
    return {
      broken: true,
      message: 'GHL rejected the token. It may have been deleted or rotated. Paste a new token in Settings.',
    };
  }
  if (httpStatus === 403) {
    return {
      broken: true,
      message: 'The token belongs to a different sub-account or cannot access this location.',
    };
  }
  if (httpStatus === 429) {
    return { broken: false, message: 'GHL rate limit reached. Try again in a minute.' };
  }
  return { broken: false, message: `GHL error ${httpStatus}.` };
}

export function menuLinkPayload(appUrl: string, locationId: string): Record<string, unknown> {
  return {
    title: 'FilersHub',
    url: `${appUrl}/widget?location_id={{location.id}}&email={{user.email}}`,
    icon: { name: 'file-invoice-dollar', fontFamily: 'fas' },
    showOnCompany: false,
    showOnLocation: true,
    showToAllLocations: false,
    locations: [locationId],
    openMode: 'iframe',
    userRole: 'all',
    allowCamera: false,
    allowMicrophone: false,
  };
}

/** Finds the FilersHub menu link scoped to this one location (agency-wide links are ignored). */
export function findFirmMenuLink(
  menus: Array<Record<string, any>>,
  locationId: string,
): Record<string, any> | null {
  return (
    menus.find(
      (m) =>
        typeof m?.url === 'string' &&
        m.url.includes('/widget?') &&
        Array.isArray(m.locations) &&
        m.locations.includes(locationId),
    ) ?? null
  );
}

export type ActionRequest =
  | { ok: true; key: ActionKey; locationId: string; contactId: string | null }
  | { ok: false; error: string };

export function validateActionRequest(body: unknown): ActionRequest {
  const b = (body ?? {}) as Record<string, any>;
  const key = b?.meta?.key;
  if (!key || typeof key !== 'string') return { ok: false, error: 'meta.key is missing.' };
  if (!(ACTION_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: `Unknown action "${key}".` };
  }
  const locationId = b?.extras?.locationId;
  if (!locationId || typeof locationId !== 'string') {
    return { ok: false, error: 'extras.locationId is missing. Use {{location.id}}.' };
  }
  if (locationId.includes('{{')) {
    return { ok: false, error: 'extras.locationId was not filled in by GHL. Check the merge field.' };
  }
  const rawContact = b?.extras?.contactId;
  if (typeof rawContact === 'string' && rawContact.includes('{{')) {
    return { ok: false, error: 'extras.contactId was not filled in by GHL. Check the merge field.' };
  }
  const contactId = typeof rawContact === 'string' && rawContact.trim() ? rawContact : null;
  return { ok: true, key: key as ActionKey, locationId, contactId };
}

/**
 * HTTP status for a workflow-action reply. Failures get 422 so GHL marks the
 * workflow step as failed; a search that simply found nothing stays 200.
 */
export function actionHttpStatus(body: Record<string, unknown>): number {
  const failed = body?.success === false || typeof body?.error === 'string';
  return failed ? 422 : 200;
}

/** Escapes LIKE/ILIKE wildcards so an email matches only itself. */
export function escapeLikePattern(value: string): string {
  return String(value ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
}

type EmailCandidate = { email?: string | null; ghl_contact_id?: string | null };

export type EmailMatch<T> =
  | { kind: 'none' }
  | { kind: 'already'; client: T }
  | { kind: 'link'; client: T }
  | { kind: 'conflict'; client: T };

/**
 * Picks the client to link to a GHL contact from email-lookup candidates.
 * Only exact (trimmed, case-insensitive) email matches count, so database
 * wildcard hits are ignored. Prefers a client already linked to this contact,
 * then an unlinked one; otherwise reports a conflict.
 */
export function pickEmailMatch<T extends EmailCandidate>(
  candidates: T[],
  email: string,
  contactId: string,
): EmailMatch<T> {
  const target = String(email ?? '').trim().toLowerCase();
  const exact = candidates.filter((c) => String(c.email ?? '').trim().toLowerCase() === target);
  const already = exact.find((c) => c.ghl_contact_id === contactId);
  if (already) return { kind: 'already', client: already };
  const unlinked = exact.find((c) => !c.ghl_contact_id);
  if (unlinked) return { kind: 'link', client: unlinked };
  if (exact.length > 0) return { kind: 'conflict', client: exact[0] };
  return { kind: 'none' };
}

export function isFilersHubAgency(
  companyId: string | null | undefined,
  agencyCompanyId: string | null | undefined,
): boolean {
  return !!companyId && !!agencyCompanyId && companyId === agencyCompanyId;
}
