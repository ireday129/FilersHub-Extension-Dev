import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeLikePattern, pickEmailMatch } from './ghl-core.ts';
import type { FirmGhl } from './ghl.ts';

// Linking FilersHub clients to GHL contacts. Used by the GHL workflow action
// "Create client in FilersHub" (crm-actions) and the contact-page button
// (ghl-sync-contact). Every query is scoped to firmId.

export interface ClientRow {
  client_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  ghl_contact_id: string | null;
}

export type ContactSyncResult =
  | { ok: true; outcome: 'already' | 'linked' | 'created'; client: ClientRow }
  | { ok: false; error: string };

export async function findClientByContactId(
  admin: SupabaseClient,
  firmId: string,
  contactId: string,
): Promise<{ client: ClientRow | null; error: string | null }> {
  const { data, error } = await admin
    .from('clients')
    .select('client_id, full_name, email, phone, ghl_contact_id')
    .eq('firm_id', firmId)
    .eq('ghl_contact_id', contactId)
    .maybeSingle();
  if (error) return { client: null, error: `Client lookup failed: ${error.message}` };
  return { client: (data as ClientRow | null) ?? null, error: null };
}

const linkedElsewhere = (email: string) =>
  `The FilersHub client with ${email} is already linked to a different GHL contact.`;

/**
 * Links the FilersHub client with this email to the GHL contact.
 * Returns null when no client in the firm has that exact email.
 */
async function linkClientByEmail(
  admin: SupabaseClient,
  firmId: string,
  email: string,
  contactId: string,
): Promise<ContactSyncResult | null> {
  // ILIKE narrows the search; pickEmailMatch keeps exact matches only
  // (PostgREST treats "*" as a wildcard, so DB hits are not trusted as-is).
  const { data, error } = await admin
    .from('clients')
    .select('client_id, full_name, email, ghl_contact_id')
    .eq('firm_id', firmId)
    .ilike('email', escapeLikePattern(email.trim()))
    .limit(10);
  if (error) return { ok: false, error: `Client lookup failed: ${error.message}` };

  const match = pickEmailMatch((data ?? []) as ClientRow[], email, contactId);
  if (match.kind === 'none') return null;
  if (match.kind === 'conflict') return { ok: false, error: linkedElsewhere(match.client.email) };
  if (match.kind === 'already') return { ok: true, outcome: 'already', client: match.client };

  const client = match.client;
  const { data: linked, error: linkError } = await admin
    .from('clients')
    .update({ ghl_contact_id: contactId })
    .eq('client_id', client.client_id)
    .eq('firm_id', firmId)
    .is('ghl_contact_id', null)
    .select('client_id');
  if (linkError) return { ok: false, error: `Failed to link client: ${linkError.message}` };

  if (!linked || linked.length === 0) {
    // Changed between read and write (e.g. a GHL retry). Fine if it now points at this contact.
    const { data: now } = await admin
      .from('clients')
      .select('ghl_contact_id')
      .eq('client_id', client.client_id)
      .eq('firm_id', firmId)
      .maybeSingle();
    if ((now as { ghl_contact_id?: string | null } | null)?.ghl_contact_id !== contactId) {
      return { ok: false, error: linkedElsewhere(client.email) };
    }
    return { ok: true, outcome: 'already', client: { ...client, ghl_contact_id: contactId } };
  }

  console.log(`Linked existing client ${client.client_id} to contact ${contactId}`);
  return { ok: true, outcome: 'linked', client: { ...client, ghl_contact_id: contactId } };
}

/**
 * Makes sure the GHL contact has a FilersHub client in this firm: returns the
 * client already linked to it, links the client with the same email, or
 * creates a new client from the contact.
 */
export async function syncContactToClient(
  admin: SupabaseClient,
  ghl: FirmGhl,
  firmId: string,
  contactId: string,
): Promise<ContactSyncResult> {
  const existing = await findClientByContactId(admin, firmId, contactId);
  if (existing.error) return { ok: false, error: existing.error };
  if (existing.client) return { ok: true, outcome: 'already', client: existing.client };

  const contactResp = await ghl.request('/contacts/' + encodeURIComponent(contactId));
  if (!contactResp.ok) {
    return { ok: false, error: `Failed to fetch contact from CRM (${contactResp.status})` };
  }
  const contactData = await contactResp.json().catch(() => ({}));
  const contact = (contactData?.contact ?? contactData ?? {}) as Record<string, unknown>;

  const fullName = String(contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`).trim();
  const email = String(contact.email || '').trim();
  const phone = (contact.phone as string | undefined) || null;
  if (!email) return { ok: false, error: 'Contact has no email address in CRM' };

  // Existing FilersHub client with this email? Link it instead of creating a duplicate.
  const linked = await linkClientByEmail(admin, firmId, email, contactId);
  if (linked) return linked;

  const { data: created, error: insertError } = await admin
    .from('clients')
    .insert({
      firm_id: firmId,
      full_name: fullName,
      email: email.toLowerCase(),
      phone,
      ghl_contact_id: contactId,
    })
    .select('client_id, full_name, email, ghl_contact_id')
    .single();

  if (insertError) {
    // Duplicate email (created by a concurrent request): link that client instead.
    if (insertError.code === '23505') {
      const race = await linkClientByEmail(admin, firmId, email, contactId);
      if (race) return race;
    }
    return { ok: false, error: `Failed to create client: ${insertError.message}` };
  }

  console.log(`Created client ${(created as ClientRow).client_id} for contact ${contactId}`);
  return { ok: true, outcome: 'created', client: created as ClientRow };
}
