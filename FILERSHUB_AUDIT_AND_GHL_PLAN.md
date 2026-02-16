# FilersHub Codebase Audit & GHL Workflow Integration Plan

## Context
A thorough audit of the entire FilersHub codebase (React 19 + Vite 6 + Supabase + Chrome Extension + Vercel serverless) was performed to identify conflicting code, bugs, and security issues. Additionally, a comprehensive set of GHL workflow triggers and actions was designed to make the GHL integration top-notch for tax firms.

---

# PART 1: All Issues Fixed

All 23 audit issues have been resolved. See the table below for details.

## Fixed Issues (Completed)

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Dev bypass button visible in production | Wrapped in `import.meta.env.DEV` guard |
| 2 | SuperAdmin gated on hardcoded email | Changed to `user.user_metadata?.is_super_admin === true` |
| 3 | Gemini API key exposed in client bundle | Removed from `vite.config.ts` define block; deleted unused `geminiService.ts` |
| 4 | Wildcard CORS on email-lookup endpoint | Added per-request `getCorsOrigin()` in `crm-auth` and `crm-users` |
| 5 | Supabase client silent fallback to placeholder | Added production-mode error throw |
| 6 | Documents.tsx hardcoded fake staff names | Replaced with `currentStaffName` prop from `useFirmData` |
| 8 | useFirmData stale closure / duplicate fetches | Added `hasFetchedRef` guard |
| 9 | Auth metadata update re-render loop risk | Changed to fire-and-forget with `clientRoleSyncedRef` guard |
| 10 | AuthContext race condition | Added `authResolvedRef` so `getSession` skips if `onAuthStateChange` already fired |
| 11 | invite-client.ts fetches ALL users | Added targeted email lookup with fallback |
| 12 | SettingsProps missing `portalMessage` | Added `portalMessage?: string` to interface |
| 13 | Dev mock uses non-existent `paymentStatus` | Removed; uses correct `paymentType` |
| 15 | Two competing useEffects for `selectedRole` | Merged into single `resolveRole` function |
| 17 | `initialTaxReturns` — 85 lines dead code | Removed from `App.tsx` |
| 18 | `geminiService.ts` unused service | Deleted file |
| 19 | `Sidebar.tsx` unused component | Deleted file |
| 20 | Unused imports and variables | Cleaned up; installed `@vercel/node` as devDependency |
| 23 | StaffLogin.tsx uses `alert()` for errors | Replaced with inline `setCrmError()` display |
| 7 | Dual GHL token storage causes sync issues | Consolidated to `integrations_ghl` as single source of truth; `crm-callback` now upserts to `integrations_ghl`; all edge functions read from `integrations_ghl` first with migration fallback from `firms`; removed dual-writes |
| 14 | `availableFirms` is `any[]` | Created `FirmOption` interface in `types.ts`; typed throughout `useFirmData` and `FirmSelection` |
| 16 | Tasks.tsx / Dashboard.tsx missing useEffect cleanup | Added stale-flag cleanup patterns, fixed dependency arrays, added error handling |
| 21 | Hardcoded values | Centralized logo URL in `constants.ts`; redirect URIs use env vars; GitHub repo refs configurable |
| 22 | `crm-update` edge function entirely mocked | Full implementation: token from `integrations_ghl` with refresh, GHL contact tag sync (`fh-status:*`), custom field updates |

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

- All 23 audit issues resolved. Build passes clean (`npx tsc --noEmit`).
- For GHL features: test OAuth flow, verify custom field creation on GHL location, verify tag add/remove on status change, test webhook ingestion
