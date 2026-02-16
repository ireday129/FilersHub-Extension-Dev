# GHL Workflow Triggers & Actions — Setup Guide

This document covers everything needed to register FilersHub workflow triggers and actions in the GHL Marketplace developer portal, and the corresponding code implementation.

---

## Table of Contents

1. [GHL Marketplace App Configuration](#1-ghl-marketplace-app-configuration)
2. [Workflow Triggers (FilersHub -> GHL)](#2-workflow-triggers-filershub---ghl)
3. [Workflow Actions (GHL -> FilersHub)](#3-workflow-actions-ghl---filershub)
4. [Required GHL Scopes](#4-required-ghl-scopes)
5. [Custom Fields Setup](#5-custom-fields-setup)
6. [Implementation Status](#6-implementation-status)

---

## 1. GHL Marketplace App Configuration

### Webhook URL

Set this in your GHL Marketplace app settings under **Webhooks**:

```
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/crm-webhook
```

This endpoint already handles `INSTALL`, `UserCreate`, and `UserUpdate` events. We will extend it to handle `ContactCreate`, `ContactUpdate`, and custom workflow action webhooks.

### How Triggers Work

FilersHub uses **two complementary mechanisms** to fire triggers into GHL:

| Mechanism | How It Works | Pro | Con |
|-----------|-------------|-----|-----|
| **Contact Tags** | Add `fh-status:{status}` tags to GHL contacts. Firms trigger workflows on "Tag Added." | Works immediately, no marketplace approval needed | Less structured, tag cleanup needed |
| **Custom Fields** | Update a "Return Status" custom field on the contact record | Data visible on contact card, queryable | Display only — not a workflow trigger by itself |

Both are applied by the `crm-update` edge function (already implemented).

### Tag Format

All FilersHub status tags follow the pattern:

```
fh-status:{kebab-case-status}
```

| FilersHub Status | GHL Tag |
|-----------------|---------|
| Intake Received | `fh-status:intake-received` |
| Compliance Review | `fh-status:compliance-review` |
| In Preparation | `fh-status:in-preparation` |
| Missing Documents | `fh-status:missing-documents` |
| Ready for Signature | `fh-status:ready-for-signature` |
| Invoice Sent | `fh-status:invoice-sent` |
| Bank Product | `fh-status:bank-product` |
| Filed | `fh-status:filed` |
| Rejected | `fh-status:rejected` |
| Accepted | `fh-status:accepted` |

When a status changes, the old `fh-status:*` tag is **removed** and the new one is **added**. This ensures only one status tag exists at a time and GHL's "Tag Added" trigger fires cleanly.

---

## 2. Workflow Triggers (FilersHub -> GHL)

These are events in FilersHub that push data to GHL, enabling firms to automate client communications.

### Tier 1 — High Impact (Implement First)

#### T1: Return Status Changed

The core trigger. Fires every time a tax return status changes.

| Field | Value |
|-------|-------|
| **Event** | Staff changes a return's status in Dashboard |
| **GHL Mechanism** | Tag added: `fh-status:{new-status}`, old tag removed |
| **Custom Field** | "Return Status" updated to new status text |
| **Trigger In GHL** | Workflow trigger: "Tag Added" → contains `fh-status:` |
| **Code** | `crm-update` edge function (implemented) |
| **Called From** | `Dashboard.tsx` → `handleSaveCase()` after status update |

**Example GHL Workflow:**
- Trigger: Tag Added = `fh-status:ready-for-signature`
- Action: Send SMS "Hi {{contact.first_name}}, your tax return is ready for signature! Log in to your portal: {{custom_field.portal_link}}"

#### T2: Document Uploaded by Client

| Field | Value |
|-------|-------|
| **Event** | Client uploads a document via the portal |
| **GHL Mechanism** | Tag added: `fh-doc-uploaded` + Contact Note with file details |
| **Code** | Needs implementation — call `crm-update` from `uploadDocument()` |
| **Called From** | `services/documents.ts` → `uploadDocument()` after successful upload |

**Tag:** `fh-doc-uploaded` (add on upload, firms can auto-remove in workflow)

#### T3: New Client Created

| Field | Value |
|-------|-------|
| **Event** | Staff creates a new client in FilersHub |
| **GHL Mechanism** | Create GHL contact via API, add tag `fh-client-created` |
| **Code** | Needs implementation — new function or extend `crm-update` |
| **Called From** | `Clients.tsx` → after client insert |

**Creates a GHL contact with:**
- Name, email, phone from FilersHub client record
- Tag: `fh-client-created`
- Custom field: "Return Status" = current status
- Stores `ghl_contact_id` back on the FilersHub `clients` record

#### T4: Return Filed

| Field | Value |
|-------|-------|
| **Event** | Status moves to "Filed" |
| **GHL Mechanism** | Handled by T1 — tag `fh-status:filed` is added |
| **Trigger In GHL** | Tag Added = `fh-status:filed` |

No additional code needed — this is a subset of T1.

#### T5: IRS Accepted / Rejected

| Field | Value |
|-------|-------|
| **Event** | Status moves to "Accepted" or "Rejected" |
| **GHL Mechanism** | Handled by T1 — tags `fh-status:accepted` or `fh-status:rejected` |
| **Trigger In GHL** | Tag Added = `fh-status:accepted` or `fh-status:rejected` |

No additional code needed — subset of T1.

---

### Tier 2 — Medium Impact

#### T6: Missing Documents Detected

| Field | Value |
|-------|-------|
| **Event** | Status -> "Missing Documents" |
| **GHL Mechanism** | Handled by T1 — tag `fh-status:missing-documents` |
| **Trigger In GHL** | Tag Added = `fh-status:missing-documents` |

Firms can build a multi-step workflow: SMS now, email in 3 days, escalation in 7 days.

#### T7: Signature Requested

| Field | Value |
|-------|-------|
| **Event** | Status -> "Ready for Signature" |
| **GHL Mechanism** | Handled by T1 — tag `fh-status:ready-for-signature` |
| **Trigger In GHL** | Tag Added = `fh-status:ready-for-signature` |

#### T8: Invoice Sent

| Field | Value |
|-------|-------|
| **Event** | Status -> "Invoice Sent" |
| **GHL Mechanism** | Handled by T1 — tag `fh-status:invoice-sent` |
| **Trigger In GHL** | Tag Added = `fh-status:invoice-sent` |

#### T9: Task Assigned to Client

| Field | Value |
|-------|-------|
| **Event** | A task is created with a client assignee |
| **GHL Mechanism** | Tag added: `fh-task-assigned`, Contact Note with task details |
| **Code** | Needs implementation — call after task insert in `Tasks.tsx` |

#### T10: Client Portal Login

| Field | Value |
|-------|-------|
| **Event** | Client logs into the portal |
| **GHL Mechanism** | Tag added: `fh-portal-active`, custom field "Last Portal Login" updated |
| **Code** | Needs implementation — fire from `AuthContext` on client login |

---

### Tier 3 — Nice to Have

#### T11: Document Signed

| Field | Value |
|-------|-------|
| **Event** | Client completes e-signature |
| **GHL Mechanism** | Tag added: `fh-doc-signed` |

#### T12: Announcement Published

| Field | Value |
|-------|-------|
| **Event** | Firm posts an announcement |
| **GHL Mechanism** | Could broadcast via GHL Campaigns API (bulk SMS/email) |

#### T13: Preparer Reassigned

| Field | Value |
|-------|-------|
| **Event** | `assigned_to` changes on a return |
| **GHL Mechanism** | Custom field "Assigned Preparer" updated, tag `fh-preparer-changed` |
| **Code** | Extend `crm-update` to accept preparer changes |

---

## 3. Workflow Actions (GHL -> FilersHub)

These are things GHL workflows can do IN FilersHub by sending webhooks to the `crm-webhook` edge function.

### Webhook Endpoint

```
POST https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/crm-webhook
```

All actions use the same endpoint with an `action` field in the JSON body to route to the correct handler.

### Tier 1 — High Impact

#### A1: Create Client from GHL Contact

GHL workflow sends a contact's data to create a FilersHub client.

**Webhook Payload:**
```json
{
  "action": "create-client",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+15551234567",
  "taxYear": "2025",
  "returnType": "1040"
}
```

**What it does:**
1. Looks up firm by `locationId`
2. Creates client record in `clients` table with `ghl_contact_id` set
3. Optionally creates a `tax_returns` record if `taxYear` is provided
4. Returns `{ clientId, message }`

#### A2: Update Tax Return Status

GHL workflow changes a return's status in FilersHub (bidirectional sync).

**Webhook Payload:**
```json
{
  "action": "update-status",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "status": "In Preparation"
}
```

**What it does:**
1. Looks up firm by `locationId`
2. Finds client by `ghl_contact_id`
3. Updates the latest `tax_returns` record's `tax_return_status`
4. Does NOT re-fire T1 back to GHL (prevents infinite loop)

#### A3: Create Task in FilersHub

GHL workflow creates a task for a staff member or client.

**Webhook Payload:**
```json
{
  "action": "create-task",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "title": "Review intake form",
  "description": "Client submitted intake form via website",
  "assignTo": "staff",
  "priority": "high"
}
```

**What it does:**
1. Looks up firm by `locationId`
2. Creates task in `tasks` table
3. If `contactId` provided, links to client

---

### Tier 2 — Medium Impact

#### A4: Add/Update Client Notes

**Webhook Payload:**
```json
{
  "action": "add-note",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "note": "Client called about extension filing"
}
```

Updates `internal_notes` on the client's latest tax return.

#### A5: Assign Preparer

**Webhook Payload:**
```json
{
  "action": "assign-preparer",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "preparerEmail": "preparer@firm.com"
}
```

Sets `assigned_to` on the client's latest tax return.

#### A6: Request Documents

**Webhook Payload:**
```json
{
  "action": "request-docs",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "categories": ["W-2", "1099-NEC", "1098"]
}
```

Sets status to "Missing Documents" and adds requested doc categories.

#### A7: Set Return Info

**Webhook Payload:**
```json
{
  "action": "set-return-info",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz",
  "taxYear": "2025",
  "returnType": "1040"
}
```

Creates or updates a tax return with the given year and type.

#### A8: Deactivate Client

**Webhook Payload:**
```json
{
  "action": "deactivate-client",
  "locationId": "loc_abc123",
  "contactId": "contact_xyz"
}
```

Sets `is_active = false` on the client record.

---

## 4. Required GHL Scopes

Ensure these scopes are enabled in your GHL Marketplace app settings:

| Scope | Used For |
|-------|----------|
| `contacts.readonly` | Fetch contact data (existing tags, custom fields) |
| `contacts.write` | Update contact tags and custom fields |
| `users.readonly` | Fetch GHL users for staff sync |
| `locations.readonly` | Read location info during OAuth |
| `locations/customFields.readonly` | Read custom field definitions |
| `locations/customFields.write` | Create "FilersHub" custom field group |
| `locations/tags.readonly` | Read existing tags |
| `locations/tags.write` | Create/manage `fh-status:*` tags |

### Scopes Already Configured (verify these are active)

Check your app at: **Marketplace > My Apps > FilersHub > Settings > Scopes**

---

## 5. Custom Fields Setup

When a firm first connects GHL, FilersHub should auto-create a custom field group and fields on their location.

### Custom Field Group: "FilersHub"

| Field Name | Field Key | Type | Description |
|------------|-----------|------|-------------|
| Return Status | `return_status` | Single Line | Current tax return status |
| Tax Year | `tax_year` | Single Line | Tax year for the return |
| Return Type | `return_type` | Single Line | e.g., 1040, 1040X, 1120S |
| Assigned Preparer | `assigned_preparer` | Single Line | Name of assigned tax preparer |
| Payment Type | `payment_type` | Single Line | Invoice, Bank Product, etc. |
| Portal Link | `portal_link` | Single Line | Direct link to client portal |
| Last Portal Login | `last_portal_login` | Single Line | Timestamp of last portal access |

The firm's `ghl_custom_field_group` (default: "FilersHub") and `ghl_custom_field_name` (default: "Return Status") columns on the `firms` table store the group/field names for the primary status field.

### Auto-Creation Flow

This should run once during the OAuth callback or first status sync:

```
POST https://services.leadconnectorhq.com/locations/{locationId}/customFields
Authorization: Bearer {accessToken}
Version: 2021-07-28

{
  "name": "Return Status",
  "dataType": "TEXT",
  "group": "FilersHub"
}
```

---

## 6. Implementation Status

### Already Implemented

| Component | Status | File |
|-----------|--------|------|
| `crm-update` edge function | Done | `supabase/functions/crm-update/index.ts` |
| Token fetch from `integrations_ghl` | Done | Used by `crm-update`, `crm-users`, `crm-auth` |
| Token auto-refresh | Done | `getValidToken()` in `crm-update` |
| Tag sync (add new `fh-status:*`, remove old) | Done | `crm-update` |
| Custom field update ("Return Status") | Done | `crm-update` |
| Webhook receiver (`crm-webhook`) | Done | `supabase/functions/crm-webhook/index.ts` |
| INSTALL handler | Done | `crm-webhook` |
| UserCreate/UserUpdate handler | Done | `crm-webhook` |

### Needs Implementation

| Component | Priority | What's Needed |
|-----------|----------|---------------|
| **Call `crm-update` from Dashboard** | HIGH | Wire `handleSaveCase()` to call `crm-update` after status save |
| **ContactCreate handler in `crm-webhook`** | HIGH | Handle `ContactCreate` to auto-create FilersHub client (A1) |
| **ContactUpdate handler in `crm-webhook`** | MEDIUM | Sync name/email/phone changes back to FilersHub |
| **Custom action handlers in `crm-webhook`** | MEDIUM | `update-status`, `create-task`, `add-note`, etc. (A2-A8) |
| **Document upload trigger** | MEDIUM | Call `crm-update` with `fh-doc-uploaded` tag from `uploadDocument()` |
| **Client create trigger** | MEDIUM | Create GHL contact + tag when staff adds client (T3) |
| **Custom field auto-creation** | LOW | Create "FilersHub" field group on first connect |
| **Task assignment trigger** | LOW | Fire tag when task assigned to client (T9) |
| **Portal login trigger** | LOW | Track + sync client logins (T10) |

### Wiring T1 (Return Status Changed) — Next Step

The `crm-update` function is ready. It just needs to be called from the frontend when a status changes. In `Dashboard.tsx`, after the `.from('tax_returns').update(...)` succeeds:

```typescript
// After successful status save, sync to GHL
if (newStatus !== previousStatus && clientId) {
    fetch(`${supabaseUrl}/functions/v1/crm-update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
            clientId: selectedReturn.clientId,
            status: newStatus,
            firmId: firmId,
        }),
    }).catch(err => console.error('GHL sync failed:', err));
}
```

This is a fire-and-forget call — the status save in FilersHub should succeed regardless of whether the GHL sync works.

---

## GHL Marketplace App Settings Checklist

Use this when configuring the app in the GHL developer portal:

- [ ] **App Name:** FilersHub
- [ ] **App Type:** Sub-Account (Location) level
- [ ] **Webhook URL:** `https://<project>.supabase.co/functions/v1/crm-webhook`
- [ ] **Scopes:** contacts.readonly, contacts.write, users.readonly, locations.readonly, locations/customFields.readonly, locations/customFields.write, locations/tags.readonly, locations/tags.write
- [ ] **Allowed redirect URIs:** Include your Vercel callback URL (`https://<your-domain>/api/crm-callback`)
- [ ] **Webhook events subscribed:** ContactCreate, ContactUpdate, UserCreate, UserUpdate, UserDelete, INSTALL
