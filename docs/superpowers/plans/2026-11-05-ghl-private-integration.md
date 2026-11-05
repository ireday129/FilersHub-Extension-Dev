# GHL Private Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GHL Marketplace OAuth app with per-firm sub-account Private Integration tokens.

**Architecture:**
- Each firm's token and workflow-actions secret live in Supabase Vault, referenced from a new `ghl_connections` table.
- All edge functions reach GHL through one shared helper. The helper marks a connection broken when GHL rejects it.
- Pure logic lives in `supabase/functions/_shared/ghl-core.ts`, with no Deno APIs and no remote imports, so it can be unit-tested with Node.

**Tech Stack:**
- Supabase edge functions (Deno, `@supabase/supabase-js@2` via esm.sh), Postgres + Supabase Vault
- React 19 + Vite + Tailwind
- Vercel serverless (`@vercel/node`)
- Node 22 built-in test runner with `--experimental-strip-types`

**Spec:** `docs/superpowers/specs/2026-11-05-ghl-private-integration-design.md`

## Global Constraints

- **GHL API:** base URL `https://services.leadconnectorhq.com`, header `Version: 2021-07-28`, header `Authorization: Bearer <token>`.
- **Required sub-account scopes:** `contacts.readonly`, `contacts.write`, `locations.readonly`, `users.readonly`.
- **Who can manage the GHL connection:** active staff with role `Firm Owner` only.
  - The spec says "Owner/Admin", but there is no Admin role. `types.ts` roles are Firm Owner, Manager, Tax Pro, and existing GHL functions are owner-only.
- **Column names:** GHL-derived columns use GHL's camelCase names (`"locationId"`, `"companyId"`); other columns stay snake_case (project rule, `.claude/CLAUDE.md`).
- **Secrets:** tokens and secrets are never returned to the browser. The only exception is `reveal-actions-secret`, for the firm's own secret.
- **Vault helpers:** `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role`.
- **Secret comparison:** always via `secretsMatch`, which is constant-time and requires an expected value of at least 32 characters.
- **Workflow action body shape:** `{meta:{key}, extras:{locationId, contactId}, data}`.
- **Status tags:** `fh-status:` plus the lower-cased, hyphenated status.
- **Sidebar link URL:** `{APP_URL}/widget?location_id={{location.id}}&email={{user.email}}`.
- **Files run by `node --test --experimental-strip-types`:** `ghl-core.ts`, `ghlActionTemplates.ts` and their tests must use only erasable TypeScript: no `enum`, no `namespace`, no parameter properties. Imports must include the `.ts` extension.
- **Shared database:** dev and prod use one Supabase database (`yjbteykmsvsgvndgnziw`). Apply the migration only after Irene says go.
- **Deploys:** functions deploy only on push to `main`. Never deploy changed existing functions by hand. Only the two new functions (`ghl-connection`, `ghl-health-check`) may be deployed early, for testing.
- **Files to leave alone:** never stage `supabase/functions/irs-oauth/index.ts`, `generate_jwk_tmp.cjs` or the untracked IRS files. They are Irene's uncommitted work.

## Review Focus

1. A token pasted with a `Bearer ` prefix, surrounding spaces or a line break should connect normally. Test: Task 1 `normalizeToken`.
2. A Location ID pasted as a full GHL URL (`…/v2/location/<id>/dashboard`) should be accepted. Test: Task 1 `normalizeLocationId`.
3. A Custom Webhook body where GHL left a merge field unfilled (literal `{{location.id}}` / `{{contact.id}}`) should get a clear error, not a "firm not found" or a wrong-record update. Test: Task 1 `validateActionRequest`.
4. When a firm's actions secret or `CRON_SECRET` is missing or short, every request is refused rather than every request accepted. Test: Task 1 `secretsMatch` with an empty or 31-character expected value.
5. When GHL answers "not authorized for this scope" with a 401 *or* a 403, the firm sees which scopes are needed, not a generic "token rejected". Test: Task 1 `describeGhlFailure`.

---

### Task 1: Pure GHL core module

**Files:**
- Create: `supabase/functions/_shared/ghl-core.ts`
- Test: `supabase/functions/_shared/ghl-core.test.ts`
- Modify: `package.json` (add a script)

**Interfaces:**
- Produces (all exported from `ghl-core.ts`):
  - `GHL_API_BASE = 'https://services.leadconnectorhq.com'`
  - `GHL_API_VERSION = '2021-07-28'`
  - `FUNCTIONS_PUBLIC_URL = 'https://sb.filershub.com/functions/v1'`
  - `STATUS_TAG_PREFIX = 'fh-status:'`
  - `REQUIRED_SCOPES` (the 4 scopes, in the order listed above)
  - `ACTION_KEYS`: `['fh_newclientaccess','create_tax_return','search_existing_return','update_return_stage','assign_preparer','add_note','request_docs','set_return_info','deactivate_client','create_task'] as const`
  - `type ActionKey = typeof ACTION_KEYS[number]`
  - `ghlHeaders(token: string, withJson?: boolean): Record<string,string>`
  - `normalizeToken(input: string): string`
  - `normalizeLocationId(input: string): string` — returns `''` when invalid; valid means `/^[A-Za-z0-9]{10,40}$/`
  - `bearerFrom(header: string | null): string`
  - `secretsMatch(expected: string, provided: string): boolean`
  - `generateSecret(): string` — 64 hex characters from `crypto.getRandomValues(new Uint8Array(32))`
  - `statusTag(status: string): string`
  - `buildStatusUpdate(existingTags: string[], status: string, customFieldName: string | null): { tags: string[]; customFields?: { key: string; field_value: string }[] }`
  - `type GhlFailure = { broken: boolean; message: string }`
  - `describeGhlFailure(httpStatus: number, bodyText: string): GhlFailure`
  - `menuLinkPayload(appUrl: string, locationId: string): Record<string, unknown>`
  - `findFirmMenuLink(menus: Array<Record<string, any>>, locationId: string): Record<string, any> | null`
  - `type ActionRequest = { ok: true; key: ActionKey; locationId: string; contactId: string | null } | { ok: false; error: string }`
  - `validateActionRequest(body: unknown): ActionRequest`
  - `isFilersHubAgency(companyId: string | null | undefined, agencyCompanyId: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing tests** in `ghl-core.test.ts` using `node:test` and `node:assert/strict`, importing from `./ghl-core.ts`.

  **`normalizeToken`**
  - `'  Bearer pit-abc-123\n'` → `'pit-abc-123'`
  - `'pit-abc\n-123'` → `'pit-abc-123'`

  **`normalizeLocationId`**
  - `'  abcDEF1234567890xyz  '` → `'abcDEF1234567890xyz'`
  - `'https://app.gohighlevel.com/v2/location/abcDEF1234567890xyz/dashboard'` → `'abcDEF1234567890xyz'`
  - `'not a location!'` → `''`

  **`bearerFrom`**
  - `'Bearer s3cret'` → `'s3cret'`
  - `null` → `''`

  **`secretsMatch`** (with `const s = 'a'.repeat(64)`)
  - `(s, s)` → true
  - `(s, s.slice(0,63)+'b')` → false
  - `(s, s.slice(0,10))` → false
  - `('', '')` → false
  - `('a'.repeat(31), 'a'.repeat(31))` → false

  **`generateSecret`**
  - matches `/^[0-9a-f]{64}$/`
  - two calls differ

  **`buildStatusUpdate(['vip','fh-status:filed'], 'Ready for Signature', 'Return Status')`** deep-equals:
  ```
  { tags: ['vip','fh-status:ready-for-signature'],
    customFields: [{ key: 'Return Status', field_value: 'Ready for Signature' }] }
  ```
  With `customFieldName = null`, the result has no `customFields` key.

  **`describeGhlFailure`**
  - `(401, '{"message":"The token is not authorized for this scope"}')` → broken true, message `'The token is missing a required scope. Required: contacts.readonly, contacts.write, locations.readonly, users.readonly.'`
  - `(403, 'not authorized for this scope')` → the same result
  - `(401, 'Invalid JWT')` → broken true, message `'GHL rejected the token. It may have been deleted or rotated. Paste a new token in Settings.'`
  - `(403, 'Forbidden')` → broken true, message `'The token belongs to a different sub-account or cannot access this location.'`
  - `(429, '')` → broken false, message `'GHL rate limit reached. Try again in a minute.'`
  - `(500, 'x')` → broken false, message `'GHL error 500.'`

  **`menuLinkPayload('https://app.filershub.com','loc123')`** deep-equals:
  ```
  { title: 'FilersHub',
    url: 'https://app.filershub.com/widget?location_id={{location.id}}&email={{user.email}}',
    icon: { name: 'file-invoice-dollar', fontFamily: 'fas' },
    showOnCompany: false, showOnLocation: true, showToAllLocations: false,
    locations: ['loc123'], openMode: 'iframe', userRole: 'all',
    allowCamera: false, allowMicrophone: false }
  ```

  **`findFirmMenuLink`**
  - The list contains:
    - an agency-wide `{id:'a', url:'https://app.filershub.com/widget?x', showToAllLocations:true, locations:[]}`
    - another firm's `{id:'b', url:'…/widget?…', locations:['other']}`
    - this firm's `{id:'c', url:'…/widget?…', locations:['loc123']}`
  - `(list, 'loc123')` returns the item with id `'c'`; `([], 'loc123')` returns `null`.

  **`validateActionRequest`**
  - Valid: `{meta:{key:'add_note'}, extras:{locationId:'loc123', contactId:'c1'}, data:{note:'hi'}}` → `{ok:true, key:'add_note', locationId:'loc123', contactId:'c1'}`
  - `{}` → `{ok:false, error:'meta.key is missing.'}`
  - Key `'nope'` → `{ok:false, error:'Unknown action "nope".'}`
  - Missing `extras.locationId` → `{ok:false, error:'extras.locationId is missing. Use {{location.id}}.'}`
  - `locationId: '{{location.id}}'` → `{ok:false, error:'extras.locationId was not filled in by GHL. Check the merge field.'}`
  - `contactId: '{{contact.id}}'` → `{ok:false, error:'extras.contactId was not filled in by GHL. Check the merge field.'}`
  - `contactId: ''` → ok with `contactId: null`

  **`isFilersHubAgency`**
  - `('c1','c1')` → true
  - `('c1','c2')` → false
  - `(null,'c1')` → false
  - `('c1','')` → false

- [ ] **Step 2: Add the test script and run it to verify it fails**

  Add `"test": "node --test --experimental-strip-types supabase/functions/_shared/ghl-core.test.ts services/ghlActionTemplates.test.ts"` to `package.json` scripts.

  Run: `node --test --experimental-strip-types supabase/functions/_shared/ghl-core.test.ts`
  Expected: FAIL, cannot find module `./ghl-core.ts`

- [ ] **Step 3: Implement `ghl-core.ts`** with the signatures above.
  - `describeGhlFailure` checks the body for `/not authorized for this scope/i` *before* looking at the status code.
  - `normalizeLocationId` takes the path segment after `/location/` when present.
  - `secretsMatch` XOR-compares every character after checking lengths.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `node --test --experimental-strip-types supabase/functions/_shared/ghl-core.test.ts`
  Expected: PASS, 0 failures

- [ ] **Step 5: Commit**: `git add supabase/functions/_shared/ghl-core.ts supabase/functions/_shared/ghl-core.test.ts package.json`, message `feat(ghl): pure core helpers for private integration`

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20261105000000_ghl_private_integration.sql`

**Interfaces:**
- Produces:
  - **Table `public.ghl_connections`**
    | Column | Type |
    |---|---|
    | `firm_id` | uuid, PK, FK `firms(firm_id)` ON DELETE CASCADE |
    | `"locationId"` | text NOT NULL UNIQUE |
    | `"companyId"` | text |
    | `location_name` | text |
    | `token_secret_id` | uuid |
    | `actions_secret_id` | uuid |
    | `status` | text NOT NULL DEFAULT 'ok', CHECK in ('ok','broken') |
    | `last_error` | text |
    | `last_checked_at` | timestamptz |
    | `token_added_at` | timestamptz |
    | `created_at` | timestamptz NOT NULL DEFAULT now() |
    | `updated_at` | timestamptz NOT NULL DEFAULT now() |
  - **RLS enabled, two SELECT policies:**
    - `"Firm owners read own GHL connection"`: `firm_id IN (SELECT firm_id FROM staff WHERE auth_user_id = auth.uid() AND role = 'Firm Owner' AND is_active)`
    - `"Super admins read GHL connections"`: `(auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE`
  - **Vault helpers.** All are `SECURITY DEFINER SET search_path = ''`.
    | Function | Behavior |
    |---|---|
    | `public.ghl_vault_store(p_name text, p_secret text) RETURNS uuid` | Deletes any `vault.secrets` row with that name, then `vault.create_secret(p_secret, p_name)` |
    | `public.ghl_vault_read(p_id uuid) RETURNS text` | Reads from `vault.decrypted_secrets` |
    | `public.ghl_vault_delete(p_id uuid) RETURNS void` | Deletes the secret |

    Each one gets `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`

- [ ] **Step 1: Write the migration SQL** exactly as described in the Interfaces above.

- [ ] **Step 2: Get Irene's go-ahead.** The database is shared by dev and prod; the migration only adds things. Then apply it with the Supabase MCP `apply_migration` (name `ghl_private_integration`).

- [ ] **Step 3: Verify** with `execute_sql`:
  - `select has_function_privilege('anon','public.ghl_vault_read(uuid)','EXECUTE'), has_function_privilege('authenticated','public.ghl_vault_read(uuid)','EXECUTE'), has_function_privilege('service_role','public.ghl_vault_read(uuid)','EXECUTE');`
    Expected: `false, false, true`.
  - `select public.ghl_vault_delete(public.ghl_vault_store('ghl_selftest','x'));`
    Expected: succeeds.
  - Then `select count(*) from vault.secrets where name='ghl_selftest';`
    Expected: `0`.

- [ ] **Step 4: Commit**: `git add supabase/migrations/20261105000000_ghl_private_integration.sql`, message `feat(db): ghl_connections table and vault helpers`

---

### Task 3: Deno GHL helper and HTTP helper

**Files:**
- Create: `supabase/functions/_shared/ghl.ts`
- Create: `supabase/functions/_shared/http.ts`

**Interfaces:**
- Consumes: Task 1 (`ghlHeaders`, `GHL_API_BASE`, `describeGhlFailure`, `buildStatusUpdate`); Task 2 table and RPCs.
- Produces from `ghl.ts`:
  - `type ConnectionStatus = 'ok' | 'broken'`
  - `interface GhlConnection { firm_id: string; locationId: string; companyId: string | null; location_name: string | null; token_secret_id: string | null; actions_secret_id: string | null; status: ConnectionStatus; last_error: string | null; last_checked_at: string | null; token_added_at: string | null }`
  - `class GhlNotConnectedError extends Error`. Its message: `'FilersHub is not connected to GHL for this firm. Connect it in Settings.'`
  - `adminClient(): SupabaseClient` — URL from `URL` ?? `SUPABASE_URL`, key from `SERVICE_ROLE_KEY` ?? `SUPABASE_SERVICE_ROLE_KEY`, matching existing functions.
  - `getConnection(admin, firmId: string): Promise<GhlConnection | null>`
  - `getConnectionByLocation(admin, locationId: string): Promise<GhlConnection | null>`
  - `vaultStore(admin, name: string, secret: string): Promise<string>`
  - `vaultRead(admin, id: string): Promise<string | null>`
  - `vaultDelete(admin, id: string): Promise<void>`
  - `interface FirmGhl { firmId: string; locationId: string; companyId: string | null; request(path: string, init?: RequestInit): Promise<Response> }`
  - `firmGhl(admin, firmId: string): Promise<FirmGhl>` — throws `GhlNotConnectedError` when there is no row or no token.
  - `setConnectionHealth(admin, firmId: string, health: { ok: true } | { ok: false; message: string }): Promise<void>` — sets `status`, `last_error`, `last_checked_at`, `updated_at`.
  - `agencyRequest(path: string, init?: RequestInit): Promise<Response>` — uses `GHL_AGENCY_API_KEY`; throws `Error('Agency API key not configured.')` when it is missing.
  - `filersHubAgencyId(): string | null` — from `GHL_AGENCY_COMPANY_ID`.
  - `syncContactStatus(ghl: FirmGhl, contactId: string, status: string, customFieldName: string | null): Promise<void>` — `GET /contacts/{id}`, then `buildStatusUpdate`, then `PUT /contacts/{id}`. Throws `Error(describeGhlFailure(...).message)` on failure.
- Produces from `http.ts`:
  - `corsHeadersFor(req: Request): Record<string,string>` — same allowed origins as `crm-auth`'s `getCorsOrigin`, plus `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`.
  - `json(req: Request, body: unknown, status?: number): Response`
  - `requireFirmOwner(admin, req: Request, firmId: string): Promise<{ userId: string } | Response>` — 401 `{error:'Please sign in.'}`, 403 `{error:'Only the firm owner can manage the GHL connection.'}`.

- [ ] **Step 1: Implement `ghl.ts` and `http.ts`.**
  `FirmGhl.request` must:
  1. prefix `GHL_API_BASE` and apply `ghlHeaders(token, !!init?.body)`;
  2. on a non-OK response, classify it with `describeGhlFailure(resp.status, await resp.clone().text())` and call `setConnectionHealth(..., {ok:false, message})` when `broken` is true;
  3. on an OK response while the stored status is `'broken'`, call `setConnectionHealth(..., {ok:true})`;
  4. return the original response.

- [ ] **Step 2: Type-check**
  Run: `npx --yes deno@2 check supabase/functions/_shared/ghl.ts supabase/functions/_shared/http.ts`
  Expected: no errors. If `npx deno` cannot install, note it in the task report and rely on Task 11's deployed checks.

- [ ] **Step 3: Commit**: `feat(ghl): shared Deno helper for firm tokens, vault and agency calls`

---

### Task 4: `ghl-connection` edge function

**Files:**
- Create: `supabase/functions/ghl-connection/index.ts`
- Modify: `.github/workflows/deploy-functions.yml` (add `supabase functions deploy ghl-connection --project-ref $PROJECT_ID --yes` to the "Require JWT" step)

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces: `POST` body `{ action, firmId, locationId?, token? }`.
  - `action` is one of `status`, `connect`, `disconnect`, `reveal-actions-secret`, `regenerate-actions-secret`. "Replace token" in the UI is `connect` again.
  - Responses:
    - `status`, `connect` and `disconnect` → `GhlConnectionStatus`:
      `{ connected: boolean; status: 'ok'|'broken'|null; locationId: string|null; locationName: string|null; companyId: string|null; isFilersHubAgency: boolean; tokenAddedAt: string|null; lastCheckedAt: string|null; lastError: string|null; actionsUrl: string; suggestedLocationId: string|null }`
      - `actionsUrl` is `${FUNCTIONS_PUBLIC_URL}/crm-actions`.
      - `suggestedLocationId` is `firms.ghl_location_id`.
    - `reveal-actions-secret` and `regenerate-actions-secret` → `{ secret: string }`
    - Errors → `{ error: string }` with status 400, 401, 403 or 409.

- [ ] **Step 1: Implement the handler.** Every action first passes `requireFirmOwner`.

  **`connect`**, in this order:
  1. Normalize the inputs.
     - Missing location → 400 `'Enter the sub-account Location ID (or paste the GHL web address of the sub-account).'`
     - Missing token → 400 `'Paste the Private Integration token.'`
  2. Conflict: another firm already has this location in `ghl_connections."locationId"` or in `firms.ghl_location_id` → 409 `'This GHL sub-account is already connected to another FilersHub firm.'`
  3. `GET /locations/{id}` with the pasted token. Not OK → 400 `'GHL refused the token: ' + describeGhlFailure(...).message`
  4. `GET /contacts/?locationId={id}&limit=1`. Not OK → 400 `'The token is missing the contacts.readonly scope.'`
  5. `GET /users/?locationId={id}`. Not OK → 400 `'The token is missing the users.readonly scope.'`
  6. Store the token: `vaultStore('ghl_pit_'+firmId, token)`. Keep the existing `actions_secret_id`, or create one with `vaultStore('ghl_actions_'+firmId, generateSecret())`.
  7. Upsert the row with `"companyId"`/`location_name` taken from the location response (`location.companyId`, `location.name`), `status:'ok'`, `last_error:null`, and `last_checked_at`/`token_added_at`/`updated_at` set to now.
  8. Set `firms.ghl_location_id`.

  **`disconnect`**: delete both Vault secrets and the row. Leave `firms.ghl_location_id` as it is.

  **`regenerate-actions-secret`**: `vaultStore` under the same name and update `actions_secret_id`.

- [ ] **Step 2: Type-check**
  Run: `npx --yes deno@2 check supabase/functions/ghl-connection/index.ts`
  Expected: no errors

- [ ] **Step 3: Commit**: `feat(ghl): ghl-connection function for connect, status and secrets`

---

### Task 5: Workflow actions — per-firm secret and templates

**Files:**
- Modify: `supabase/functions/crm-actions/index.ts`
  - remove the global `CRM_ACTIONS_SECRET` block;
  - remove `resolveLocation`, `getValidToken` and `syncStatusTagToGhl`;
  - change the handler signatures that take `accessToken` (`handleCreateClient`, `handleUpdateReturnStage`, `handleRequestDocs`) to take `ghl: FirmGhl | null`.
- Modify: `.github/workflows/deploy-functions.yml`: add `supabase functions deploy crm-actions --project-ref $PROJECT_ID --no-verify-jwt --yes` to the "No JWT Check" step. It is currently deployed only by hand.
- Create: `services/ghlActionTemplates.ts`
- Test: `services/ghlActionTemplates.test.ts`

**Interfaces:**
- Consumes: `validateActionRequest`, `bearerFrom`, `secretsMatch`, `ACTION_KEYS` (Task 1); `getConnectionByLocation`, `vaultRead`, `firmGhl`, `syncContactStatus`, `GhlNotConnectedError` (Task 3).
- Produces:
  - `interface ActionTemplate { key: string; label: string; description: string; data: Record<string, unknown> }`
  - `ACTION_TEMPLATES: ActionTemplate[]`
  - `actionBody(t: ActionTemplate): string` — `JSON.stringify({meta:{key}, extras:{locationId:'{{location.id}}', contactId:'{{contact.id}}'}, data}, null, 2)`

- [ ] **Step 1: Write the failing test** `services/ghlActionTemplates.test.ts`, importing `ACTION_KEYS` from `../supabase/functions/_shared/ghl-core.ts`:
  - the set of template keys equals the set of `ACTION_KEYS`;
  - every `actionBody` result parses as JSON with `extras.locationId === '{{location.id}}'` and `meta.key === template.key`;
  - the `update_return_stage` template's `data.new_status` is `'Ready for Signature'`.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npm test`
  Expected: FAIL on `ghlActionTemplates.ts`, module not found

- [ ] **Step 3: Implement `ghlActionTemplates.ts`.** Templates (`data` shown):

  | Key | Label | `data` |
  |---|---|---|
  | `fh_newclientaccess` | Create client in FilersHub | `{}` |
  | `create_tax_return` | Create tax return | `{tax_year:'2025', return_type:'1040'}` |
  | `search_existing_return` | Find existing return | `{tax_year:'2025'}` |
  | `update_return_stage` | Update return status | `{return_id:'PASTE_RETURN_ID', new_status:'Ready for Signature'}` |
  | `assign_preparer` | Assign preparer | `{preparer_email:'preparer@yourfirm.com'}` |
  | `add_note` | Add note | `{note:'{{contact.first_name}} called about their return.'}` |
  | `request_docs` | Request documents | `{categories:['W-2','1099']}` |
  | `set_return_info` | Set return info | `{tax_year:'2025', return_type:'1040'}` |
  | `deactivate_client` | Deactivate client | `{}` |
  | `create_task` | Create task | `{title:'Follow up', description:'', due_date:'2026-04-15', priority:'Medium', assign_to_email:'preparer@yourfirm.com'}` |

  Each template gets a one-sentence `description` of what the action does.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: Rework the `crm-actions` entry point.**
  1. Parse JSON. On failure → 400 `{success:false, error:'Body must be JSON.'}`.
  2. `validateActionRequest`. On error → 400 `{success:false, error}`.
  3. `getConnectionByLocation`. None → 401 `{success:false, error:'This GHL sub-account is not connected to FilersHub.'}`.
  4. `secretsMatch(await vaultRead(actions_secret_id), bearerFrom(Authorization))`. False → 401 `{success:false, error:'Unauthorized'}`.
  5. `firmId = connection.firm_id`.
  6. `ghl = await firmGhl(...)`, or `null` on `GhlNotConnectedError`. Keep today's rule: `fh_newclientaccess`, `update_return_stage` and `request_docs` return `{success:false, error}` when `ghl` is null.
  7. Replace `syncStatusTagToGhl(...)` calls with `syncContactStatus(ghl, contactId, status, customFieldName)`, reading `ghl_custom_field_name` from `firms` (default `'Return Status'`).
  8. Replace raw contact fetches with `ghl.request('/contacts/'+contactId)`.

- [ ] **Step 6: Type-check**
  Run: `npx --yes deno@2 check supabase/functions/crm-actions/index.ts`
  Expected: no new errors. The file has `// @ts-nocheck`, so this checks syntax and imports only.

- [ ] **Step 7: Commit**: `feat(ghl): per-firm secret for workflow actions; copyable templates`

---

### Task 6: `crm-update` and `crm-users` use the firm token

**Files:**
- Modify: `supabase/functions/crm-update/index.ts`
  - delete `getValidToken` and the inline tag logic;
  - keep the Nov 2026 staff check.
- Modify: `supabase/functions/crm-users/index.ts`
  - delete `getAccessToken`;
  - in `list`, delete the agency-key-first path.

**Interfaces:**
- Consumes: `firmGhl`, `syncContactStatus`, `GhlNotConnectedError` (Task 3)

- [ ] **Step 1: `crm-update`.** After the client lookup:
  - `syncContactStatus(await firmGhl(admin, firmId), contactId, status, customFieldName)`.
  - `GhlNotConnectedError` → 200 `{skipped:true, message: err.message}`.
  - Other errors → 502 `{error: err.message}`.

- [ ] **Step 2: `crm-users` `list`.**
  - Fetch `/users/?locationId=…` through `firmGhl(...).request`.
  - On `GhlNotConnectedError` or a non-OK response, keep the existing database fallback and add `ghlError: <message>` to the response.
  - Grant, revoke and update-role are unchanged.

- [ ] **Step 3: Type-check**
  Run: `npx --yes deno@2 check supabase/functions/crm-update/index.ts supabase/functions/crm-users/index.ts`
  Expected: no new errors

- [ ] **Step 4: Verify no leftovers**
  Run: `grep -n "oauth/token\|integrations_ghl\|GHL_CLIENT" supabase/functions/crm-update/index.ts supabase/functions/crm-users/index.ts`
  Expected: no output

- [ ] **Step 5: Commit**: `refactor(ghl): crm-update and crm-users use per-firm private token`

---

### Task 7: Sidebar link and branding sync (FilersHub-agency firms only)

**Files:**
- Modify: `supabase/functions/crm-sidebar-pin/index.ts`
  - delete `getValidToken`, `ghlCustomMenuRequest` and the OAuth fallback.
- Modify: `supabase/functions/crm-logo-sync/index.ts`
  - delete `getValidToken` and the OAuth fallback.

**Interfaces:**
- Consumes: `getConnection`, `agencyRequest`, `filersHubAgencyId` (Task 3); `isFilersHubAgency`, `menuLinkPayload`, `findFirmMenuLink` (Task 1)

- [ ] **Step 1: Shared gate in both functions,** after the existing owner and Pro checks:
  - No connection → 400 `{error:'Connect GHL in Settings first.'}`.
  - `!isFilersHubAgency(conn.companyId, filersHubAgencyId())` → 400 `{error:'This only works automatically for sub-accounts in the FilersHub agency. Settings shows how your agency admin can set it up.', code:'OTHER_AGENCY'}`.

- [ ] **Step 2: `crm-sidebar-pin`.**
  - List menus with `agencyRequest('/custom-menus/')`, reading `customMenus ?? data ?? []`.
  - **pin**: if `findFirmMenuLink` finds one → `{success:true, action:'already_pinned', menuId}`. Otherwise `POST /custom-menus/` with `menuLinkPayload(APP_URL, conn.locationId)` → `{success:true, action:'pinned', menuId}`.
  - **unpin**: `DELETE /custom-menus/{id}` for the found link only.

- [ ] **Step 3: `crm-logo-sync`.** `PUT /locations/{conn.locationId}` via `agencyRequest`. The payload is unchanged.

- [ ] **Step 4: Type-check both files.** Same command style. Expected: no new errors.

- [ ] **Step 5: Commit**: `feat(ghl): per-firm sidebar link; agency-only branding sync`

---

### Task 8: Nightly health check

**Files:**
- Create: `supabase/functions/ghl-health-check/index.ts`
- Create: `api/ghl-health-check.ts`
- Modify: `vercel.json` — add `{ "path": "/api/ghl-health-check", "schedule": "0 4 * * *" }` to `crons`
- Modify: `.github/workflows/deploy-functions.yml` — add `supabase functions deploy ghl-health-check --project-ref $PROJECT_ID --no-verify-jwt --yes`

**Interfaces:**
- Consumes: `firmGhl`, `setConnectionHealth`, `adminClient` (Task 3); `secretsMatch` (Task 1)
- Produces:
  - **Edge function**: POST with header `x-cron-secret`. Returns `{ checked: number; ok: number; broken: number }`. 401 when `!secretsMatch(Deno.env.get('CRON_SECRET') ?? '', header)`.
  - **Vercel route**: GET. 401 unless `req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET` and the secret is set. Forwards to `${SUPABASE_URL}/functions/v1/ghl-health-check` with `x-cron-secret` and relays the status and JSON.

- [ ] **Step 1: Implement the edge function.** For each `ghl_connections` row, in sequence:
  1. `request('/locations/'+locationId)`.
  2. If OK, update `location_name`, `"companyId"` and `last_checked_at`.
  3. If OK, `request('/users/?locationId='+locationId)` and, for each user, `update staff set full_name = user.name where firm_id = … and ghl_user_id = user.id`.
  4. If not OK, `request` has already marked the connection broken; just set `last_checked_at`.

- [ ] **Step 2: Implement the Vercel route,** following the style of `api/check-location.ts`.

- [ ] **Step 3: Type-check.**
  Run: `npx --yes deno@2 check supabase/functions/ghl-health-check/index.ts && npx tsc --noEmit -p .`
  Expected: no new errors

- [ ] **Step 4: Commit**: `feat(ghl): nightly connection health check`

---

### Task 9: Remove the OAuth app code

**Files:**
- Modify: `supabase/functions/crm-auth/index.ts`
  - delete the `fetchLocationInfo` helper (~lines 118–131);
  - delete the dead `if (false && … 'email-lookup')` block (~142–384), keeping the 403 stub above it;
  - delete the INIT block (~462–677) and the CALLBACK block (~678–1256);
  - keep `claim-subscription` and the 404 fallback.
- Delete: `api/crm-callback.ts`, `components/InstallSuccess.tsx`, `supabase/functions/crm-webhook/` (the deployed copy stays until rollout step 8)
- Modify: `App.tsx` — remove the `InstallSuccess` import and the `/install-success` route
- Modify: `.github/workflows/deploy-functions.yml` — remove the `crm-webhook` line

- [ ] **Step 1: Make the deletions above.**

- [ ] **Step 2: Verify no OAuth leftovers**
  Run: `grep -rn "oauth/token\|chooselocation\|GHL_CLIENT\|integrations_ghl\|ghl_access_token\|install-success\|crm-webhook" api supabase/functions components App.tsx .github`
  Expected: no output

- [ ] **Step 3: Build**
  Run: `npx tsc --noEmit && npm run build`
  Expected: both succeed

- [ ] **Step 4: Commit**: `chore(ghl): remove marketplace OAuth install, callback and webhook`

---

### Task 10: Settings connection card and Super Admin status

**Files:**
- Create: `services/ghlConnection.ts`
- Create: `components/GhlConnectionCard.tsx`
- Modify: `components/Settings.tsx`
  - render the card above "Team & Permissions" with `id="ghl-connection"`;
  - replace the "Reconnect CRM" OAuth link (~line 528) with a link to `#ghl-connection`, shown when `ghlError` mentions `connect` or `token`;
  - in `handleSave`, call `syncBrandingToCrm` and `pinToGhlSidebar` only when the card reports `connected && isFilersHubAgency`.
- Modify: `components/SuperAdminDashboard.tsx` — load `ghl_connections (firm_id, status)` and replace `ghlIntegrated: !!f.ghl_location_id` with `ghlStatus: 'connected' | 'broken' | 'none'`, shown as Connected / Broken / Not connected.

**Interfaces:**
- Consumes: the Task 4 API; Task 5 `ACTION_TEMPLATES` and `actionBody`
- Produces:
  - `services/ghlConnection.ts` exports:
    - type `GhlConnectionStatus` (the Task 4 shape)
    - `getGhlStatus(firmId)`
    - `connectGhl(firmId, locationId, token)`
    - `disconnectGhl(firmId)`, each returning `Promise<GhlConnectionStatus>`
    - `revealActionsSecret(firmId)` and `regenerateActionsSecret(firmId)`, each returning `Promise<string>`
    - Each one throws `Error(message)`, where the message is read from the function's `{error}` body (via `error.context.json()` when `supabase.functions.invoke` returns an error).
  - `<GhlConnectionCard firmId: string; onStatus?: (s: GhlConnectionStatus) => void />`

- [ ] **Step 1: Implement `services/ghlConnection.ts`.**

- [ ] **Step 2: Implement `GhlConnectionCard`** with Tailwind, matching the Settings section styling.

  **Not connected:**
  - numbered steps: GHL sub-account → Settings → Private Integrations → Create new integration → name "FilersHub" → tick the 4 scopes (listed) → copy the token;
  - a Location ID input pre-filled from `suggestedLocationId`;
  - a password-type token input;
  - a Connect button.

  **Connected:**
  - location name;
  - an "Your agency" / "Other agency" badge;
  - token added date, and when `tokenAddedAt` is more than 90 days old, the note "GHL recommends replacing this token every 90 days.";
  - the last check time;
  - Replace token, which reopens the inputs and calls `connectGhl`;
  - Disconnect, behind a `confirm()`.

  **Broken:** a red banner: `GHL connection stopped working on {lastCheckedAt date}: {lastError}. Paste a new token.`

  **Workflow actions panel** (when connected):
  - `actionsUrl` with Copy;
  - the secret, masked, with Reveal / Copy / Regenerate (Regenerate warns that existing GHL workflows must be updated);
  - one collapsible row per `ACTION_TEMPLATES` entry showing `actionBody(t)` with Copy.

  **Other agency:** the sidebar-link instructions: URL `https://app.filershub.com/widget?location_id={{location.id}}&email={{user.email}}`, open in iframe, show in this sub-account only.

  It must work at extension width: use the existing `isExtension` sizing pattern from Settings.

- [ ] **Step 3: Wire up Settings and Super Admin** as listed under Files.

- [ ] **Step 4: Build**
  Run: `npx tsc --noEmit && npm run build && npm test`
  Expected: all succeed

- [ ] **Step 5: Commit**: `feat(ghl): Settings connection card, workflow action templates, admin status`

---

### Task 11: Release and verify against GHL

This task needs Irene at three points: approving the PR and merge to `dev`, creating a token in GHL, and approving the merge to `main`.

- [ ] **Step 1: Push and open a PR.**
  - Push `feature/ghl-private-integration` and open a PR into `dev`. It also carries the unmerged `hotfix/close-remaining-holes` commit.
  - The Vercel preview build must pass. A cron-limit error shows up here.

- [ ] **Step 2: Apply and deploy for dev testing.** After the merge into `dev`:
  - apply the migration (Task 2, Step 2);
  - deploy only the new `ghl-connection` and `ghl-health-check` functions with the Supabase MCP `deploy_edge_function`;
  - set Supabase secrets `GHL_AGENCY_COMPANY_ID` (the FilersHub agency `companyId`, from the `ghl_webhooks` INSTALL rows for that agency) and `CRON_SECRET` (`generateSecret()` value), and set `CRON_SECRET` in Vercel too.

- [ ] **Step 3: Verify the connection flow on dev.filershub.com,** using the FilersHub firm. Irene creates a sub-account token in GHL.
  - Connect with the correct token → Connected, "Your agency".
  - Connect with a token from Hannah Financial's sub-account against FilersHub's location → refused with `GHL refused the token: …`.
  - Connect with a token missing `users.readonly` → `The token is missing the users.readonly scope.`

- [ ] **Step 4: Merge `dev` → `main`** after Irene approves. The Actions workflow deploys the changed functions. Confirm in the Supabase function list that `crm-auth`, `crm-actions`, `crm-update`, `crm-users`, `crm-sidebar-pin`, `crm-logo-sync`, `ghl-connection` and `ghl-health-check` have new versions.

- [ ] **Step 5: Verify against GHL** on app.filershub.com:
  1. CRM Team Members lists GHL users.
  2. Change a test client's return status: the `fh-status:*` tag changes on the GHL contact.
     - Record whether the "Return Status" custom field changed. Today's code sends the field *name* as `key`; if GHL ignores it, that is existing behavior and goes in the report, not a fix here.
  3. A test GHL workflow using Custom Webhook with the `add_note` template:
     - the correct secret gives `success:true`;
     - a wrong secret gives 401.
  4. Pin the sidebar link: it appears only in the FilersHub sub-account. Then unpin it.
  5. Call `/api/ghl-health-check` with the cron secret: `{checked:N, ok:N, broken:0}`.
  6. Expire a throwaway token in GHL, connect with it, run the health check: Settings shows the Broken banner.

- [ ] **Step 6: Hand Irene the rollout checklist** (spec "Rollout" steps 4–8) with exact GHL click paths for each firm.
