# FilersHub Codebase Audit & GHL Workflow Integration Plan

## Context
A thorough audit of the entire FilersHub codebase (React 19 + Vite 6 + Supabase + Chrome Extension + Vercel serverless) was performed to identify conflicting code, bugs, and security issues. Additionally, a comprehensive set of GHL workflow triggers and actions was designed to make the GHL integration top-notch for tax firms.

---

# PART 1: Issues Found (Prioritized)

## CRITICAL - Security

### 1. Dev bypass button visible in production
- **File:** `components/auth/Login.tsx:185-196`
- **Issue:** "Skip Login (Dev Mode)" button renders on the `/login` page for all users. No `import.meta.env.DEV` guard. Calls `bypassAuth()` which creates a mock session, allowing navigation through the entire UI.
- **Fix:** Wrap in `{import.meta.env.DEV && !isPortal && (...)}`

### 2. SuperAdmin access gated on hardcoded email
- **File:** `App.tsx:511`
- **Issue:** `user.email === 'irene@hannahfinancial.com'` is client-side only. Anyone who inspects the bundle can see this. No server-side role enforcement.
- **Fix:** Add a `role` column to staff/auth (e.g., `is_super_admin`), enforce via Supabase RLS, and check `user.user_metadata.is_super_admin` instead.

### 3. Gemini API key exposed in client bundle
- **File:** `vite.config.ts:23-24`
- **Issue:** `GEMINI_API_KEY` is injected into client JS via `define`. Anyone loading the app can extract it from the bundle.
- **Fix:** Move Gemini calls to a Supabase edge function or Vercel serverless API route. Never expose API keys client-side.

### 4. Wildcard CORS on unauthenticated email-lookup endpoint
- **Files:** `supabase/functions/crm-auth/index.ts:8`, all edge functions
- **Issue:** `Access-Control-Allow-Origin: *` on the `email-lookup` action which requires no auth. Anyone who knows a staff email can request a session token.
- **Fix:** Restrict CORS to `APP_URL`, `chrome-extension://{extension-id}`, and GHL domains. Add rate limiting.

### 5. Supabase client silent fallback to placeholder credentials
- **File:** `services/supabase.ts:10-13`
- **Issue:** If env vars are missing, the client initializes with `'https://placeholder.supabase.co'` and `'placeholder-key'`, silently failing. Hard to debug in production.
- **Fix:** Throw an error in production if env vars are undefined.

---

## CRITICAL - Bugs

### 6. `Documents.tsx` uses hardcoded fake staff names
- **File:** `components/Documents.tsx:38-43`
- **Issue:** `staffName` is set to "Sarah Johnson", "Marcus Aurelius", or "David Smith" based on role. The "My Documents" view scope filter compares `doc.preparer` against these fake names, so it **never matches real data**. The document filtering is broken in production.
- **Fix:** Pass `currentStaffName` from `useFirmData` as a prop and use it instead of the hardcoded names.

### 7. Dual GHL token storage causes sync issues
- **Files:** `api/crm-callback.ts`, `supabase/functions/crm-auth/index.ts`, `supabase/functions/crm-users/index.ts`
- **Issue:** GHL OAuth tokens are stored in both `firms` table AND `integrations_ghl` table. The Vercel callback only writes to `firms`; the edge functions write to both. If either update fails, the tables get out of sync. Token refresh has no concurrency protection.
- **Fix:** Consolidate to a single source of truth (`integrations_ghl`), with `firms` table only referencing it. Add optimistic concurrency checks on refresh.

### 8. `useFirmData` stale closure in useEffect
- **File:** `hooks/useFirmData.ts:287-291`
- **Issue:** `useEffect` depends only on `[user]` but reads `firmId` and `availableFirms` from state inside the callback. If `user` reference changes (e.g., token refresh), `fetchData()` is called again with stale `availableFirms = []` from the old closure, causing duplicate fetches.
- **Fix:** Add `firmId` and `availableFirms.length` to the dependency array, or use a ref.

### 9. Auth metadata update inside data fetch causes re-render loop risk
- **File:** `hooks/useFirmData.ts:143-148`
- **Issue:** `supabase.auth.updateUser({ data: { role: 'Client' } })` called inside `fetchData()` triggers `onAuthStateChange`, which re-renders the component tree, potentially re-triggering `fetchData()`.
- **Fix:** Move the metadata update out of `fetchData` into a separate one-time effect.

### 10. Race condition in `AuthContext.tsx`
- **File:** `contexts/AuthContext.tsx:20-36`
- **Issue:** Both `getSession()` and `onAuthStateChange` independently set session state and `loading = false`. They race: `onAuthStateChange` might set a valid session from a URL fragment, then `getSession()` resolves and overwrites it with `null`.
- **Fix:** Use a single state-setting flow. Set loading to false only after both have resolved, or use a flag to prevent `getSession` from overwriting an `onAuthStateChange` result.

### 11. `invite-client.ts` fetches ALL users to find one
- **File:** `api/invite-client.ts:21-24`
- **Issue:** `auth.admin.listUsers()` fetches the entire user list, then `.find()` searches for the email. This will not scale.
- **Fix:** Use `auth.admin.getUserByEmail(email)` or a targeted query.

---

## MEDIUM - Type Errors & Inconsistencies

### 12. `SettingsProps` missing `portalMessage` field
- **File:** `components/Settings.tsx:30-44`
- **Issue:** `SettingsProps.firmSettings` is typed as `{ name, logo, color, slug? }` but the component reads and writes `localSettings.portalMessage` throughout. Type contract is broken.
- **Fix:** Add `portalMessage?: string` to the `firmSettings` interface in `SettingsProps`.

### 13. `paymentStatus` field doesn't exist in `TaxReturn` type
- **File:** `hooks/useFirmData.ts:52`
- **Issue:** Dev bypass mock uses `paymentStatus: 'Paid'` but the `TaxReturn` interface has `paymentType`, not `paymentStatus`.
- **Fix:** Change to `paymentType: 'Invoice'` (or appropriate value).

### 14. `availableFirms` is `any[]` passed to typed `FirmOption[]` prop
- **File:** `App.tsx:188`
- **Issue:** No type safety on the data flowing from `useFirmData` to `FirmSelection`. Runtime mismatches would be silent.
- **Fix:** Type `availableFirms` properly in `useFirmData` return type.

### 15. Two competing `useEffect`s set `selectedRole`
- **File:** `App.tsx:120-144`
- **Issue:** First effect sets role from `user_metadata`, second sets from URL path. They can conflict on `/super-admin`.
- **Fix:** Merge into a single effect with clear priority logic.

### 16. `Tasks.tsx` and `Dashboard.tsx` missing useEffect cleanup / dependency issues
- **Files:** `components/Tasks.tsx:85-87`, `components/Dashboard.tsx:319-345`
- **Issue:** Async Supabase calls without abort/cleanup, missing `fetchTasks` in dependency array, no error destructuring on Dashboard queries.
- **Fix:** Add AbortController cleanup, fix dependency arrays, handle errors.

---

## LOW - Dead Code & Cleanup

### 17. `initialTaxReturns` - 85 lines of dead code
- **File:** `App.tsx:14-99` (defined but never referenced)

### 18. `geminiService.ts` - unused service file
- **File:** `services/geminiService.ts` (never imported anywhere, uses wrong model name `gemini-3-flash-preview`)

### 19. `Sidebar.tsx` - unused component
- **File:** `components/Sidebar.tsx` (never imported)

### 20. Unused imports and variables
- `useCallback` imported but unused in `App.tsx:1`
- `userAvatar` destructured but unused in `App.tsx:108`
- `VITE_GHL_CLIENT_ID`, `VITE_GHL_CLIENT_SECRET`, `VITE_GHL_REDIRECT_URI` defined in `.env.local` but never used in frontend code
- `@vercel/node` used in API files but not in `package.json` devDependencies

### 21. Hardcoded values that should be configurable
- Logo URL hardcoded to GHL CDN in `StaffLogin.tsx:89`, `SuperAdminLogin.tsx:34`, `SuperAdminDashboard.tsx:31`
- Redirect URI hardcoded to `sb.filershub.com` in `crm-auth/index.ts:474,532`
- GitHub repo hardcoded in `sync-ghl-docs.ts:11-12`

### 22. `crm-update` edge function is entirely mocked
- **File:** `supabase/functions/crm-update/index.ts:42-56`
- All GHL contact sync logic is a `console.log`. No actual API calls are made.

### 23. `StaffLogin.tsx` uses `alert()` for errors
- **File:** `components/StaffLogin.tsx:39`
- Inconsistent with other login components that use inline error display.

---

# PART 2: GHL Workflow Triggers & Actions

## Workflow Triggers (FilersHub -> GHL)

These are events in FilersHub that fire outbound to GHL, enabling firms to build automations.

### Tier 1 - High Impact

| # | Trigger | Event | Why It Matters |
|---|---------|-------|----------------|
| T1 | **Return Status Changed** | Tax return status changes (e.g., "In Preparation" -> "Ready for Signature") | The #1 trigger. Automate client comms at every stage: "Your return is being prepared", "Please sign your return", "Your return was accepted." Replaces manual texting/emailing. |
| T2 | **Document Uploaded by Client** | Client uploads a document via portal | Notify preparer instantly, auto-move out of "Missing Documents", send client confirmation SMS. |
| T3 | **New Client Created** | Staff adds a client in FilersHub | Auto-create/link GHL contact, trigger onboarding workflow (welcome SMS, intake form, pipeline). |
| T4 | **Return Filed** | Status moves to "Filed" | Trigger congratulations message, referral request, post-filing follow-up sequence. |
| T5 | **IRS Accepted / Rejected** | Status moves to "Accepted" or "Rejected" | Instant client notification. For rejections: auto-create follow-up task. |

### Tier 2 - Medium Impact

| # | Trigger | Event | Why It Matters |
|---|---------|-------|----------------|
| T6 | **Missing Documents Detected** | Status -> "Missing Documents" | Automated document request sequences (SMS now, email in 3 days, escalation in 7 days). The #1 bottleneck in tax prep. |
| T7 | **Signature Requested** | Status -> "Ready for Signature" | Auto-send portal link via SMS for signing. Dramatically increases turnaround. |
| T8 | **Invoice Sent** | Status -> "Invoice Sent" | Payment reminder automation, include payment links in SMS. |
| T9 | **Task Assigned to Client** | Client task created | Send task notification via SMS/email even if client doesn't check portal. |
| T10 | **Client Portal Login** | Client logs into portal | Track engagement. Trigger re-engagement if no login for X days during tax season. |

### Tier 3 - Nice to Have

| # | Trigger | Event | Why It Matters |
|---|---------|-------|----------------|
| T11 | **Document Signed** | Client completes e-signature | Confirm receipt, auto-advance to next status. |
| T12 | **Announcement Published** | Firm posts client announcement | Broadcast via GHL campaigns (bulk SMS/email). |
| T13 | **Preparer Reassigned** | `assigned_to` changes | Notify new preparer, send client intro message. |

**Implementation mechanism:** Use GHL Contact Tags as the primary trigger (add `fh-status:{status}` tags, remove old ones). GHL workflows trigger on "Tag Added." Also update GHL Custom Fields for data display on the contact record.

---

## Workflow Actions (GHL -> FilersHub)

These are things GHL workflows can trigger in FilersHub via webhooks to the `crm-webhook` edge function.

### Tier 1 - High Impact

| # | Action | What It Does | Why It Matters |
|---|--------|-------------|----------------|
| A1 | **Create Client from GHL Contact** | GHL form submission / tag / pipeline creates a FilersHub client | Leads from ads/forms auto-appear in FilersHub. No manual entry. |
| A2 | **Update Tax Return Status** | GHL workflow sets a return's status in FilersHub | Bidirectional automation. E.g., "Client books review appointment -> status to Compliance Review." |
| A3 | **Create Task in FilersHub** | GHL workflow creates a staff or client task | Orchestrate internal workflow from CRM. E.g., "Intake form submitted -> create task for office manager." |

### Tier 2 - Medium Impact

| # | Action | What It Does | Why It Matters |
|---|--------|-------------|----------------|
| A4 | **Add/Update Client Notes** | Push GHL conversation context into FilersHub internal notes | Tax pro sees all context alongside the return without switching apps. |
| A5 | **Assign Preparer** | Set/change the assigned preparer from GHL | Enable round-robin or rule-based assignment from CRM. |
| A6 | **Request Documents** | Mark document categories as needed, auto-set "Missing Documents" status | Tax pro identifies missing docs in GHL, client gets notified via portal. |
| A7 | **Set Return Info** | Set tax year and return type from GHL intake form data | Intake form data flows directly into FilersHub without manual entry. |
| A8 | **Deactivate Client** | Mark client inactive from GHL | CRM-driven client lifecycle management. |

---

## Two-Way Sync Features

| Priority | Sync | Direction | Mechanism |
|----------|------|-----------|-----------|
| **High** | Tax Return Status -> GHL Custom Field | FH -> GHL | Custom field in "FilersHub" group (already has `ghl_custom_field_group`/`ghl_custom_field_name` columns on firms table) |
| **High** | Tax Return Status -> GHL Contact Tags | FH -> GHL | Add/remove `fh-status:{status}` tags. Primary workflow trigger mechanism. |
| **High** | Contact <-> Client core fields (name, email, phone) | Bidirectional | Link via `ghl_contact_id`, sync on create/update webhooks |
| **Medium** | Assigned Preparer -> GHL Custom Field | FH -> GHL | Custom field "Assigned Preparer" |
| **Medium** | Payment Type -> GHL Custom Field | FH -> GHL | Custom field "Payment Type" |
| **Medium** | Document uploads -> GHL Contact Notes | FH -> GHL | Add note with upload details |
| **Medium** | Tax Year / Return Type -> GHL Custom Fields | Bidirectional | Custom fields, sync on create/update |
| **Lower** | Pipeline Stage <-> Tax Return Status mapping | Bidirectional | Configurable mapping table. High "wow factor" but needs `opportunities.write` scope. |

---

## Implementation Phases (for GHL features)

**Phase 1 - Foundation:** Un-mock `crm-update`, implement custom field + tag sync for status changes (T1), enable ContactCreate/Update in `crm-webhook` (T3, S1)

**Phase 2 - Client Comms:** Document upload triggers (T2), sub-status triggers (T4-T8), Create Client action (A1)

**Phase 3 - Bidirectional:** Update Status from GHL (A2), Create Task (A3), remaining actions (A4-A8)

**Phase 4 - Advanced:** Pipeline mapping (S8), remaining triggers (T10-T13)

---

## Verification

- After fixing issues #1-5 (security): verify dev bypass button is hidden in production builds, test SuperAdmin access with different emails, confirm API key is not in client bundle
- After fixing #6: test "My Documents" scope filter with a real staff name
- After fixing #8-10: test auth flow end-to-end (fresh login, token refresh, SSO from GHL iframe)
- Run `npx tsc --noEmit` to catch type errors from fixes #12-14
- For GHL features: test OAuth flow, verify custom field creation on GHL location, verify tag add/remove on status change, test webhook ingestion
