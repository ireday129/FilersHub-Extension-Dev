# FilersHub Marketplace Workflow Actions Setup Guide

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
| Short Description | Creates a new client in FilersHub from the contact |
| Summary | Automatically creates a FilersHub client record using the contact's name, email, and phone. Idempotent — if the client already exists, returns the existing record. |

### Input Fields
None required. Add a dummy field (e.g. "Notes" as optional text) if the marketplace requires at least one input field.

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
| Summary | Creates a new tax return record linked to the contact's FilersHub client. Requires the client to exist first (run Create FilersHub Client action first). Idempotent — if a return with the same client + year + type already exists, returns the existing record. |

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
| Short Description | Searches for the most recent tax return for a contact |
| Summary | Looks up the contact's linked FilersHub client and finds their most recent tax return. Optionally filter by tax year. Returns the return details if found, or found=false if no return exists. |

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
| Short Description | Updates the status of a FilersHub tax return and syncs the tag |
| Summary | Updates a tax return's status in FilersHub and syncs the status as a tag (fh-status:*) and custom field on the contact. Use the return_id from the Search action output. |

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

## Action 5: Assign Preparer

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Assign FilersHub Preparer |
| Action Key | `assign_preparer` |
| Short Description | Assigns a staff preparer to the client's latest tax return |
| Summary | Looks up the staff member by email and assigns them as the preparer on the contact's most recent FilersHub tax return. |

### Input Fields

**preparer_email** (Text, Required)
- Label: Preparer Email
- Description: The email address of the staff member to assign as preparer.

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
  meta: { key: 'assign_preparer', version: '1' }
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
  "preparerName": "Jane Smith",
  "preparerEmail": "jane@firm.com",
  "previousPreparer": ""
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| preparerName | preparerName |
| preparerEmail | preparerEmail |
| previousPreparer | previousPreparer |

---

## Action 6: Add Note to FilersHub Return

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Add Note to FilersHub Return |
| Action Key | `add_note` |
| Short Description | Appends a note to the client's latest tax return |
| Summary | Adds a timestamped note to the internal notes on the contact's most recent FilersHub tax return. |

### Input Fields

**note** (Text / Large Text, Required)
- Label: Note
- Description: The note text to add to the client's return.

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
  meta: { key: 'add_note', version: '1' }
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
  "clientName": "John Doe",
  "note": "[2026-03-03 via CRM Workflow] Client called about extension filing"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| clientName | clientName |
| note | note |

---

## Action 7: Request Documents

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Request FilersHub Documents |
| Action Key | `request_docs` |
| Short Description | Sets the return to Missing Documents and logs the requested categories |
| Summary | Changes the client's latest tax return status to "Missing Documents", logs the requested document categories as a note, and syncs the status tag to the contact. |

### Input Fields

**categories** (Text, Optional)
- Label: Document Categories
- Description: Comma-separated list of document types to request (e.g. "W-2, 1099-NEC, 1098"). Leave blank for a general request.

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
  meta: { key: 'request_docs', version: '1' }
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
  "clientName": "John Doe",
  "previousStatus": "In Preparation",
  "newStatus": "Missing Documents",
  "categories": "W-2, 1099-NEC, 1098"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| clientName | clientName |
| previousStatus | previousStatus |
| newStatus | newStatus |
| categories | categories |

---

## Action 8: Set Return Info

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Set FilersHub Return Info |
| Action Key | `set_return_info` |
| Short Description | Creates or updates a tax return with the given year and type |
| Summary | Sets the tax year and/or return type on the client's latest FilersHub return. If no return exists, creates a new one (both tax_year and return_type are required for creation). |

### Input Fields

**tax_year** (Select / Dropdown, Optional)
| Key | Label |
|-----|-------|
| 2026 | 2026 |
| 2025 | 2025 |
| 2024 | 2024 |
| 2023 | 2023 |
| 2022 | 2022 |
| 2021 | 2021 |

**return_type** (Select / Dropdown, Optional)
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
  meta: { key: 'set_return_info', version: '1' }
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
  "clientName": "John Doe",
  "taxYear": "2025",
  "returnType": "INDIVIDUAL_1040",
  "action": "updated"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| returnId | returnId |
| clientName | clientName |
| taxYear | taxYear |
| returnType | returnType |
| action | action |

---

## Action 9: Deactivate FilersHub Client

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Deactivate FilersHub Client |
| Action Key | `deactivate_client` |
| Short Description | Deactivates a client in FilersHub |
| Summary | Sets the client's is_active flag to false in FilersHub. The client will no longer appear in active client lists. This does not delete any data. |

### Input Fields
None required. Add a dummy field (e.g. "Confirm" as optional text) if the marketplace requires at least one input field.

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
  meta: { key: 'deactivate_client', version: '1' }
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

## Action 10: Create FilersHub Task

### Action Info
| Field | Value |
|-------|-------|
| Action Name | Create FilersHub Task |
| Action Key | `create_task` |
| Short Description | Creates a task in FilersHub for a staff member or client |
| Summary | Creates a new task in FilersHub. If a contactId is in the workflow, the task is linked to that client. Optionally assign to a specific staff member by email. |

### Input Fields

**title** (Text, Required)
- Label: Task Title
- Description: The title of the task to create.

**description** (Text / Large Text, Optional)
- Label: Description
- Description: Additional details for the task.

**priority** (Select / Dropdown, Optional)
| Key | Label |
|-----|-------|
| Low | Low |
| Medium | Medium (Default) |
| High | High |

**assign_to_email** (Text, Optional)
- Label: Assign To (Staff Email)
- Description: Email of the staff member to assign. Leave blank to assign to the client.

**due_date** (Text, Optional)
- Label: Due Date
- Description: Due date in YYYY-MM-DD format (e.g. "2026-04-15").

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
  meta: { key: 'create_task', version: '1' }
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
  "taskId": "abc123-def456",
  "title": "Review intake form",
  "type": "client",
  "priority": "High"
}
```

### Custom Variables to Map
| Variable | JSON Path |
|----------|-----------|
| success | success |
| taskId | taskId |
| title | title |
| type | type |
| priority | priority |

---

## Notes

- **All actions always return HTTP 200** (even on errors) so the marketplace doesn't disable the endpoint.
- **Idempotency:** Create Client and Create Tax Return are safe to run multiple times — they return existing records if duplicates are detected.
- **Marketplace test mode** won't have real `location`, `contact`, or `workflow` objects, so tests will return `{"success":false,"error":"No locationId provided in extras"}`. This is expected — the actions work correctly in real workflows.
- **Edge function must be deployed** with JWT verification disabled in the Supabase Dashboard.
- **Custom code uses `axios`** because the marketplace custom code runtime does not have `fetch`.
