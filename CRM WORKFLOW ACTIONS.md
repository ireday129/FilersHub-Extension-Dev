# GHL Marketplace Workflow Actions Setup Guide

All 4 actions use the same Supabase Edge Function endpoint:
```
https://sb.filershub.com/functions/v1/crm-actions
```

All actions use **Custom Code** execution mode (not API mode).

---

## Action 1: Create FilersHub Client

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Create FilersHub Client |
| Action Key | `fh_newclientaccess` |
| Short Description | Creates a new client in FilersHub from the GHL contact |
| Summary | Automatically creates a FilersHub client record using the contact's name, email, and phone from GHL. Idempotent — if the client already exists, returns the existing record. |

### Input Fields
None required. Add a dummy field (e.g. "Notes" as optional text) if GHL requires at least one input field.

### Action Execution
- **Type:** Custom Code
- **Custom Code:**
```javascript
const response = await axios.post('https://sb.filershub.com/functions/v1/crm-actions', {
  data: inputData,
  extras: {
    locationId: location.id,
    contactId: contact.id,
    workflowId: workflow.id
  },
  meta: { key: 'fh_newclientaccess', version: '1' }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer noauth'
  }
});
return response.data;
```

### Sample Response (for Custom Variables)
```json
{
  "success": true,
  "clientId": "abc123-def456",
  "clientName": "John Doe",
  "clientEmail": "john@example.com"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| clientId | clientId |
| clientName | clientName |
| clientEmail | clientEmail |

---

## Action 2: Create FilersHub Tax Return

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Create FilersHub Tax Return |
| Action Key | `create_tax_return` |
| Short Description | Creates a tax return for an existing FilersHub client |
| Summary | Creates a new tax return record linked to the GHL contact's FilersHub client. Requires the client to exist first (run Create FilersHub Client action first). Idempotent — if a return with the same client + year + type already exists, returns the existing record. |

### Input Fields

**tax_year** (Select / Dropdown)
| Key | Label |
|-----|-------|
| 2026 | 2026 |
| 2025 | 2025 |
| 2024 | 2024 |
| 2023 | 2023 |
| 2022 | 2022 |
| 2021 | 2021 |

**return_type** (Select / Dropdown)
| Key | Label |
|-----|-------|
| INDIVIDUAL_1040 | Individual Tax Return (Form 1040) |
| JOINT_1040 | Married Filing Jointly |
| SEPARATE_1040 | Married Filing Separately |
| HEAD_OF_HOUSEHOLD | Head of Household |
| AMENDED_1040X | Amended Individual Return (1040-X) |
| BUSINESS_PARTNERSHIP_1065 | Partnership Return (Form 1065) |
| BUSINESS_S_CORP_1120S | S Corporation Return (Form 1120-S) |
| BUSINESS_C_CORP_1120 | C Corporation Return (Form 1120) |
| FIDUCIARY_1041 | Estate or Trust Return (Form 1041) |
| NONPROFIT_990 | Nonprofit Return (Form 990) |
| STATE_ONLY | State Only Return |
| LOCAL_ONLY | Local or City Return |

### Action Execution
- **Type:** Custom Code
- **Custom Code:**
```javascript
const response = await axios.post('https://sb.filershub.com/functions/v1/crm-actions', {
  data: inputData,
  extras: {
    locationId: location.id,
    contactId: contact.id,
    workflowId: workflow.id
  },
  meta: { key: 'create_tax_return', version: '1' }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer noauth'
  }
});
return response.data;
```

### Sample Response (for Custom Variables)
```json
{
  "success": true,
  "returnId": "abc123-def456",
  "clientId": "client-789",
  "clientName": "John Doe",
  "clientEmail": "john@example.com",
  "taxYear": "2025",
  "returnType": "INDIVIDUAL_1040"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| clientId | clientId |
| clientName | clientName |
| clientEmail | clientEmail |
| taxYear | taxYear |
| returnType | returnType |

---

## Action 3: Search FilersHub Return

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Search FilersHub Return |
| Action Key | `search_existing_return` |
| Short Description | Searches for the most recent tax return for a GHL contact |
| Summary | Looks up the GHL contact's linked FilersHub client and finds their most recent tax return. Optionally filter by tax year. Returns the return details if found, or found=false if no return exists. |

### Input Fields

**tax_year** (Text, Optional)
- Label: Tax Year
- Description: Optional — filter by a specific tax year (e.g. "2025"). Leave blank to get the most recent return.

### Action Execution
- **Type:** Custom Code
- **Custom Code:**
```javascript
const response = await axios.post('https://sb.filershub.com/functions/v1/crm-actions', {
  data: inputData,
  extras: {
    locationId: location.id,
    contactId: contact.id,
    workflowId: workflow.id
  },
  meta: { key: 'search_existing_return', version: '1' }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer noauth'
  }
});
return response.data;
```

### Sample Response (for Custom Variables)
```json
{
  "found": true,
  "returnId": "abc123-def456",
  "clientName": "John Doe",
  "taxYear": "2025",
  "returnType": "INDIVIDUAL_1040",
  "currentStatus": "In Preparation"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| found | found |
| returnId | returnId |
| clientName | clientName |
| taxYear | taxYear |
| returnType | returnType |
| currentStatus | currentStatus |

---

## Action 4: Update FilersHub Return Status

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Update FilersHub Return Status |
| Action Key | `update_return_stage` |
| Short Description | Updates the status of a FilersHub tax return and syncs tag to GHL |
| Summary | Updates a tax return's status in FilersHub and syncs the status as a tag (fh-status:*) and custom field on the GHL contact. Use the return_id from the Search action output. |

### Input Fields

**return_id** (Text, Required)
- Label: Return ID
- Description: The FilersHub return ID. Use the output from the "Search FilersHub Return" action: `{{search_existing_return.returnId}}`

**new_status** (Select / Dropdown, Required)
| Key | Label |
|-----|-------|
| Intake Received | Intake Received |
| Compliance Review | Compliance Review |
| In Preparation | In Preparation |
| Missing Documents | Missing Documents |
| Ready for Signature | Ready for Signature |
| Invoice Sent | Invoice Sent |
| Bank Product | Bank Product |
| Filed | Filed |
| Rejected | Rejected |
| Accepted | Accepted |

### Action Execution
- **Type:** Custom Code
- **Custom Code:**
```javascript
const response = await axios.post('https://sb.filershub.com/functions/v1/crm-actions', {
  data: inputData,
  extras: {
    locationId: location.id,
    contactId: contact.id,
    workflowId: workflow.id
  },
  meta: { key: 'update_return_stage', version: '1' }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer noauth'
  }
});
return response.data;
```

### Sample Response (for Custom Variables)
```json
{
  "success": true,
  "returnId": "abc123-def456",
  "previousStatus": "In Preparation",
  "newStatus": "Ready for Signature"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| previousStatus | previousStatus |
| newStatus | newStatus |

---

## Notes

- **All actions always return HTTP 200** (even on errors) so GHL doesn't disable the endpoint.
- **Idempotency:** Create Client and Create Tax Return are safe to run multiple times — they return existing records if duplicates are detected.
- **GHL test mode** won't have real `location`, `contact`, or `workflow` objects, so tests will return `{"success":false,"error":"No locationId provided in extras"}`. This is expected — the actions work correctly in real workflows.
- **Edge function must be deployed** with JWT verification disabled in the Supabase Dashboard.
- **Custom code uses `axios`** because GHL's custom code runtime does not have `fetch`.
