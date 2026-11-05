# GHL Private Integration — Design

- **Date:** 2026-11-05
- **Status:** Design approved in chat; spec awaiting review
- **Branch:** `feature/ghl-private-integration` (built on `hotfix/close-remaining-holes`, which holds the Nov 5 security fixes)

## Goal

Stop depending on the GoHighLevel Marketplace app. FilersHub connects to each firm's GHL sub-account with a **Private Integration token** instead of OAuth. Firms in any GHL agency must keep working, not only sub-accounts in the FilersHub agency.

## Facts this design rests on

Sources: GHL developer docs, help center and ideas board, checked Nov 2026.

1. **An agency Private Integration token cannot reach a firm's contacts, tags or custom fields.** Those endpoints accept sub-account tokens only.
2. **An agency token can't be swapped for a sub-account token.** `POST /oauth/locationToken` works for OAuth apps only, and agency private integrations can't get the `oauth.*` scopes.
   - So **every firm needs its own sub-account token**, including firms in the FilersHub agency.
3. **Private integration tokens never expire.** GHL recommends replacing them every 90 days. "Rotate and expire later" keeps the old and new tokens working side by side for 7 days.
4. **Some features belong to marketplace apps only:**
   - webhook events (INSTALL, UserCreate, and so on);
   - custom actions in the GHL workflow builder;
   - SSO user data.
5. **Custom menu links can only be created with an agency token.** Their URL variables (`{{location.id}}`, `{{user.email}}`) aren't signed, so anyone can fake them.
6. **Rate limits:** 100 requests per 10 seconds, and 200,000 per day per location.
7. **Where things stand today:**
   - 5 firms.
   - Every OAuth token expired in Feb–Mar 2026.
   - The `integrations_ghl` table the code writes to was never created in production.
   - Assurance Tax & Accounting Group is in a different agency (Tax Nitro).
   - So today's GHL connection is effectively already down for all firms.

## What firms will see

### 1. Connecting GHL (Settings → "GoHighLevel connection", Firm Owner/Admin only)

- **Not connected:** step-by-step instructions, then two fields, Location ID and Private Integration token, and a **Connect** button.
  - The Location ID is pre-filled when the firm already has one on file.
  - Instructions: in the GHL sub-account, go to Settings → Private Integrations → Create new integration. Name it "FilersHub", tick the scopes, then copy the token.
  - **Required scopes:**
    - `contacts.readonly`
    - `contacts.write`
    - `locations.readonly`
    - `users.readonly`
  - Tags and the "Return Status" custom field are written through the contact update, so `contacts.write` covers them.
- **What Connect does on the server:**
  1. `GET /locations/{locationId}` with the token. Success proves the token belongs to that sub-account.
  2. `GET /contacts/?locationId=…&limit=1` and `GET /users/?locationId=…` to check the read scopes.
  3. Save the token and record the sub-account name and its agency (`companyId`).
  4. Link the firm to the location.
  - A location can be linked to only one firm. Connect is refused if another firm already has it, either in `ghl_connections` or in `firms.ghl_location_id`.
  - Write scopes can't be tested without changing data. A missing `contacts.write` shows up on the first status sync, which marks the connection broken and names the cause.
- **Connected:** shows the sub-account name, "Your agency" or "Other agency", the date the token was added, the last check time and the status. Buttons: **Replace token** and **Disconnect**.
  - After 90 days, a note appears: "GHL recommends replacing this token every 90 days."
- **Broken:** a red banner: "GHL connection stopped working on {date}: {reason}. Paste a new token."
- **Disconnect** deletes the token. It keeps `firms.ghl_location_id`, so the widget still recognizes the firm.

### 2. Workflow actions (replaces the marketplace workflow actions)

Firms use GHL's built-in **Custom Webhook** workflow action.

- **What Settings shows:**
  - the URL `https://sb.filershub.com/functions/v1/crm-actions`;
  - the firm's own **actions secret**, with Reveal, Copy and Regenerate;
  - a ready-to-copy body for each action.
- **What the firm enters in GHL:** method POST; header `Authorization: Bearer <secret>`; content type JSON; and a body like:
  ```json
  {"meta":{"key":"update_return_stage"},
   "extras":{"locationId":"{{location.id}}","contactId":"{{contact.id}}"},
   "data":{"stage":"Ready for Signature"}}
  ```
  The body keeps the `{meta, extras, data}` shape that `crm-actions` already reads, so its 10 action handlers don't change.
- **Checking each request:**
  1. Look up the firm by `extras.locationId`.
  2. Compare the Bearer value with that firm's secret, in constant time.
  3. Reject the request if they differ.
  - A firm's secret works only for that firm's own data. This replaces the single global `CRM_ACTIONS_SECRET`, which every firm would have needed to know.

### 3. Signing in from inside GHL

- No change from the security fix: the widget link shows a one-time sign-in form, and the session then persists.
- URL values such as `location_id` and `email` only pre-fill the form or pick the firm. They are never trusted as proof of who someone is.
- Removed: "Sign in with GHL" (OAuth login and reconnect) and the `/install-success` page.

### 4. Sidebar link (Pro)

- **Firms in the FilersHub agency:** `crm-sidebar-pin` uses the agency token to create one custom menu link per firm, visible only in that firm's sub-account. The fields follow the current docs:
  ```
  title: FilersHub
  url: {APP_URL}/widget?location_id={{location.id}}&email={{user.email}}
  showOnCompany: false
  showOnLocation: true
  showToAllLocations: false
  locations: [locationId]
  openMode: iframe
  userRole: all
  ```
  - Unpin deletes that firm's link only.
  - Today's single link is shown in every sub-account in the agency, including ones that aren't FilersHub customers. It gets deleted during rollout.
- **Firms in other agencies:** Settings shows the URL and settings for their agency admin to add by hand.

### 5. Logo and brand-color sync

- `PUT /locations/{id}` accepts agency tokens only, so the existing sync keeps using the agency token for FilersHub-agency firms.
- For other firms the button is hidden, with a one-line note explaining why.

### 6. Team members

- The "CRM Team Members" grant and revoke screen (`crm-users`) uses the firm's token. No change for users.
- Staff are no longer auto-created for every GHL user. The old `UserCreate` webhook did that, and it made every GHL admin a Firm Owner.
- The nightly job refreshes the names of staff already linked to a GHL user.

## Architecture

### Database

Migration `supabase/migrations/20261105_ghl_private_integration.sql`. It only adds things, so it's safe for both dev and prod, which share one database.

- **Table `public.ghl_connections`**

  | Column | Type | Notes |
  |---|---|---|
  | `firm_id` | uuid | Primary key; FK to `firms`, `ON DELETE CASCADE` |
  | `"locationId"` | text | `NOT NULL UNIQUE` |
  | `"companyId"` | text | |
  | `location_name` | text | |
  | `token_secret_id` | uuid | Vault ID of the private integration token |
  | `actions_secret_id` | uuid | Vault ID of the actions secret |
  | `status` | text | `'ok'` or `'broken'` |
  | `last_error` | text | |
  | `last_checked_at` | timestamptz | |
  | `token_added_at` | timestamptz | |
  | `created_at` | timestamptz | |
  | `updated_at` | timestamptz | |

  - GHL field names keep GHL's camelCase, per the project rules.
  - RLS is on. Firm Owner/Admin can SELECT their own row. Rows hold only Vault IDs, never secrets. No client-side writes.
- **Vault helpers** `ghl_vault_store(name, secret)`, `ghl_vault_read(id)` and `ghl_vault_delete(id)`:
  - `SECURITY DEFINER`;
  - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`;
  - `GRANT EXECUTE` to `service_role` only.
  - Supabase Vault (`supabase_vault` 0.3.1) is already enabled.
- **Later cleanup migration,** run only after rollout is verified: drop `firms.ghl_access_token`, `ghl_refresh_token` and `ghl_token_expires_at`.

### Shared GHL helper: `supabase/functions/_shared/ghl.ts`

- `getConnection(admin, firmId)` and `getFirmToken(admin, firmId)`: read the token from Vault.
- `ghlFetch(admin, firmId, path, init)`:
  - adds the base URL `https://services.leadconnectorhq.com`, `Authorization: Bearer` and `Version: 2021-07-28`;
  - on 401/403, sets the firm's connection to `broken` with the error text.
- `agencyFetch(path, init)`: same, using `GHL_AGENCY_API_KEY`.
- `isFilersHubAgency(companyId)`: compares with `GHL_AGENCY_COMPANY_ID`.
- This replaces the OAuth refresh code copied into `crm-auth`, `crm-users`, `crm-update`, `crm-actions`, `crm-logo-sync` and `crm-sidebar-pin`.

### New edge function: `ghl-connection` (JWT required)

- Actions: `status`, `connect`, `replace-token`, `disconnect`, `reveal-actions-secret`, `regenerate-actions-secret`.
- Caller must be active Firm Owner/Admin staff of the firm.

### Changed

- `crm-actions`: per-firm secret check; uses `ghlFetch`.
- `crm-update`, `crm-users`: use `ghlFetch`.
- `crm-logo-sync`, `crm-sidebar-pin`: use `agencyFetch`; FilersHub-agency firms only; per-firm menu links with the documented field names.
- `crm-auth`:
  - removed: OAuth `init` and `callback`, and token refresh;
  - kept: `claim-subscription`, plus the disabled `email-lookup` stub, which still returns 403.
- `components/Settings.tsx`: new `GhlConnectionCard` and workflow-actions panel. The "Reconnect CRM" OAuth link becomes a link to the connection card.
- `components/SuperAdminDashboard.tsx`: the GHL column shows Connected, Broken or Not connected.
- `App.tsx`: remove the `/install-success` route.
- `.github/workflows/deploy-functions.yml`: add `ghl-connection`; stop deploying `crm-webhook`.
- `vercel.json`: add a daily cron for `/api/ghl-health-check`.

### New Vercel route: `api/ghl-health-check.ts` (cron, checks `CRON_SECRET`)

For each connection:
1. `GET /locations/{locationId}`, then set `ok` or `broken`, `last_checked_at`, `location_name` and `companyId`.
2. If OK, `GET /users/?locationId=…` to refresh linked staff names.

Firms are checked one after another, which stays far below the rate limits.

### Removed

- `api/crm-callback.ts`
- `components/InstallSuccess.tsx`
- the `crm-webhook` function: no longer deployed, and deleted from Supabase once the marketplace app is uninstalled
- The `ghl_webhooks` table keeps its history but nothing writes to it any more.

### Environment variables

| Name | Where | Change |
|---|---|---|
| `GHL_AGENCY_API_KEY` | Supabase | Keep. Must be an agency private integration with `custom-menu-link.readonly/write`, `locations.readonly` and `locations.write`. |
| `GHL_AGENCY_COMPANY_ID` | Supabase + Vercel | New: the FilersHub agency's `companyId`. |
| `CRON_SECRET` | Vercel | New. |
| `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `CRM_ACTIONS_SECRET` | Supabase / Vercel | Delete after rollout. |

## Errors

- **Connect rejected:** the message names the likely cause: wrong sub-account, a token from a different sub-account, or a missing scope.
- **GHL returns 401/403 during use:** the connection is marked broken. The UI says "GHL connection needs attention" and links to Settings, and `crm-actions` returns `{success:false, error}`.
- **429 rate limit:** the error is returned without a retry. FilersHub's volume is far below the limits.

## Security

- Tokens and action secrets live only in Vault. They are read only by the service role and never sent to the browser, except that an owner can reveal the firm's own actions secret.
- Each firm's actions secret works only for that firm. Comparison is constant-time.
- One location maps to at most one firm.
- GHL URL variables are treated as hints, never as identity.

## Testing

Test on the FilersHub firm with a real sub-account token:

1. Connect with:
   - the right token, which succeeds;
   - a token from another sub-account, which is refused;
   - a token missing `contacts.readonly` or `users.readonly`, which is refused with that scope named.
2. List and grant GHL team members.
3. Change a test client's return status, then confirm the `fh-status:*` tag and the custom field change on the GHL contact.
4. Fire each Custom Webhook action from a test workflow:
   - the right secret works;
   - a wrong secret, or another firm's secret, gets 401.
5. Pin and unpin the sidebar link; it appears only in that sub-account.
6. Expire a throwaway token in GHL, run the health check, and confirm it shows Broken with the banner.
7. `npx tsc --noEmit` and `npm run build` pass.

## Rollout

Dev and prod share one Supabase database, and functions deploy only when `main` changes. So:

1. Apply the migration (additive). Deploy the new `ghl-connection` function. Test the Settings connection flow on dev.filershub.com.
2. Merge to `main`, which deploys the changed functions. Production GHL is already down, so this restores it rather than risking it.
3. Set `GHL_AGENCY_COMPANY_ID` and `CRON_SECRET`, and confirm the scopes on `GHL_AGENCY_API_KEY`.
4. Create tokens for FilersHub, Hannah Financial and Blue Signatures, and connect each one.
5. Send Assurance Tax the connection instructions.
6. Delete the old agency-wide FilersHub custom menu link, then re-pin it for each Pro firm.
7. Rebuild any GHL workflows that used FilersHub marketplace actions as Custom Webhooks.
8. Uninstall the marketplace app, delete the `crm-webhook` function, remove the old env vars, and run the cleanup migration.

## Out of scope

- Syncing contact creates and updates from GHL into FilersHub. The old webhook only logged them.
- Auto-creating firms when GHL installs happen.
- Automatic token rotation.
