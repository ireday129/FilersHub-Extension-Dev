// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerFrom, secretsMatch, validateActionRequest } from '../_shared/ghl-core.ts';
import { firmGhl, getConnectionByLocation, GhlNotConnectedError, syncContactStatus, vaultRead } from '../_shared/ghl.ts';
import type { FirmGhl } from '../_shared/ghl.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_STATUSES = [
    'Intake Received', 'Compliance Review', 'In Preparation', 'Missing Documents',
    'Ready for Signature', 'Invoice Sent', 'Bank Product', 'Filed', 'Rejected', 'Accepted',
];

// =====================================================
// HELPERS
// =====================================================

function jsonResponse(body: object): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function failure(status: number, error: string): Response {
    return new Response(JSON.stringify({ success: false, error }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

async function findClientByContactId(supabase: any, firmId: string, contactId: string) {
    const { data: client, error } = await supabase
        .from('clients')
        .select('client_id, full_name, email, phone, ghl_contact_id')
        .eq('firm_id', firmId)
        .eq('ghl_contact_id', contactId)
        .maybeSingle();

    if (error) return { client: null, error: `Client lookup failed: ${error.message}` };
    if (!client) return { client: null, error: null };

    return { client, error: null };
}

// =====================================================
// ACTION HANDLERS
// =====================================================

async function handleCreateClient(
    supabase: any, extras: any, data: any, firmId: string, ghl: FirmGhl | null,
) {
    if (!ghl) return jsonResponse({ success: false, error: 'This firm is not connected to GoHighLevel.' });

    const contactId = extras?.contactId;
    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });

    // Check for existing client (idempotent)
    const { client: existing } = await findClientByContactId(supabase, firmId, contactId);
    if (existing) {
        console.log(`Client already exists for contact ${contactId}: ${existing.client_id}`);
        return jsonResponse({
            success: true,
            clientId: existing.client_id,
            clientName: existing.full_name,
            clientEmail: existing.email,
            message: 'Client already exists',
        });
    }

    // Fetch contact from GHL API
    const contactResp = await ghl.request('/contacts/' + encodeURIComponent(contactId));

    if (!contactResp.ok) {
        return jsonResponse({
            success: false,
            error: `Failed to fetch contact from CRM (${contactResp.status})`,
        });
    }

    const contactData = await contactResp.json();
    const contact = contactData.contact || contactData;

    const fullName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const email = contact.email || '';
    const phone = contact.phone || null;

    if (!email) {
        return jsonResponse({ success: false, error: 'Contact has no email address in CRM' });
    }

    // Insert client
    const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
            firm_id: firmId,
            full_name: fullName,
            email: email.toLowerCase(),
            phone,
            ghl_contact_id: contactId,
        })
        .select('client_id, full_name, email')
        .single();

    if (insertError) {
        // Handle duplicate email
        if (insertError.code === '23505') {
            const { client: existingByEmail } = await findClientByContactId(supabase, firmId, contactId);
            if (existingByEmail) {
                return jsonResponse({
                    success: true,
                    clientId: existingByEmail.client_id,
                    clientName: existingByEmail.full_name,
                    clientEmail: existingByEmail.email,
                    message: 'Client already exists (matched by email)',
                });
            }
        }
        return jsonResponse({ success: false, error: `Failed to create client: ${insertError.message}` });
    }

    console.log(`Created client ${newClient.client_id} for contact ${contactId}`);
    return jsonResponse({
        success: true,
        clientId: newClient.client_id,
        clientName: newClient.full_name,
        clientEmail: newClient.email,
    });
}

async function handleCreateTaxReturn(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    const taxYear = data?.tax_year;
    const returnType = data?.return_type;

    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });
    if (!taxYear || !returnType) {
        return jsonResponse({ success: false, error: 'tax_year and return_type are required in data' });
    }

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({
            success: false,
            error: clientError || `No client found for contact ${contactId}. Run the Create Client action first.`,
        });
    }

    // Check for duplicate return (idempotent)
    const { data: existing } = await supabase
        .from('tax_returns')
        .select('return_id, tax_year, return_type, tax_return_status')
        .eq('client_id', client.client_id)
        .eq('tax_year', taxYear)
        .eq('return_type', returnType)
        .maybeSingle();

    if (existing) {
        console.log(`Tax return already exists: ${existing.return_id}`);
        return jsonResponse({
            success: true,
            returnId: existing.return_id,
            clientId: client.client_id,
            clientName: client.full_name,
            clientEmail: client.email,
            taxYear: existing.tax_year,
            returnType: existing.return_type,
            message: 'Tax return already exists',
        });
    }

    // Insert tax return
    const { data: newReturn, error: insertError } = await supabase
        .from('tax_returns')
        .insert({
            client_id: client.client_id,
            firm_id: firmId,
            tax_year: taxYear,
            return_type: returnType,
            tax_return_status: 'Intake Received',
        })
        .select('return_id')
        .single();

    if (insertError) {
        return jsonResponse({ success: false, error: `Failed to create tax return: ${insertError.message}` });
    }

    console.log(`Created tax return ${newReturn.return_id} for client ${client.client_id}`);
    return jsonResponse({
        success: true,
        returnId: newReturn.return_id,
        clientId: client.client_id,
        clientName: client.full_name,
        clientEmail: client.email,
        taxYear,
        returnType,
    });
}

async function handleSearchExistingReturn(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    if (!contactId) return jsonResponse({ found: false, error: 'contactId is required in extras' });

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ found: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Search returns
    let query = supabase
        .from('tax_returns')
        .select('return_id, tax_year, return_type, tax_return_status, updated_at')
        .eq('client_id', client.client_id);

    if (data?.tax_year) {
        query = query.eq('tax_year', data.tax_year);
    }

    const { data: returns, error: queryError } = await query
        .order('updated_at', { ascending: false })
        .limit(1);

    if (queryError) {
        return jsonResponse({ found: false, error: `Search failed: ${queryError.message}` });
    }

    if (!returns || returns.length === 0) {
        return jsonResponse({
            found: false,
            returnId: '',
            clientName: client.full_name,
            taxYear: '',
            returnType: '',
            currentStatus: '',
        });
    }

    const ret = returns[0];
    console.log(`Found return ${ret.return_id} for contact ${contactId}`);
    return jsonResponse({
        found: true,
        returnId: ret.return_id,
        clientName: client.full_name,
        taxYear: ret.tax_year || '',
        returnType: ret.return_type || '',
        currentStatus: ret.tax_return_status || '',
    });
}

async function handleUpdateReturnStage(
    supabase: any, extras: any, data: any, firmId: string, ghl: FirmGhl | null, customFieldName: string,
) {
    const returnId = data?.return_id;
    const newStatus = data?.new_status;

    if (!returnId || !newStatus) {
        return jsonResponse({ success: false, error: 'return_id and new_status are required in data' });
    }

    if (!VALID_STATUSES.includes(newStatus)) {
        return jsonResponse({
            success: false,
            error: `Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
    }

    // Fetch current return (with firm ownership check)
    const { data: taxReturn, error: fetchError } = await supabase
        .from('tax_returns')
        .select('return_id, client_id, tax_return_status')
        .eq('return_id', returnId)
        .eq('firm_id', firmId)
        .single();

    if (fetchError || !taxReturn) {
        return jsonResponse({ success: false, error: 'Tax return not found or does not belong to this firm' });
    }

    const previousStatus = taxReturn.tax_return_status;

    // Skip if no change
    if (previousStatus === newStatus) {
        return jsonResponse({
            success: true,
            returnId: taxReturn.return_id,
            previousStatus,
            newStatus,
            message: 'Status unchanged',
        });
    }

    // Update the return
    const { error: updateError } = await supabase
        .from('tax_returns')
        .update({
            tax_return_status: newStatus,
            updated_at: new Date().toISOString(),
        })
        .eq('return_id', returnId);

    if (updateError) {
        return jsonResponse({ success: false, error: `Update failed: ${updateError.message}` });
    }

    // Sync tag to GHL (best-effort)
    let warning: string | undefined;
    try {
        const { data: client } = await supabase
            .from('clients')
            .select('ghl_contact_id')
            .eq('client_id', taxReturn.client_id)
            .single();

        if (client?.ghl_contact_id && ghl) {
            await syncContactStatus(ghl, client.ghl_contact_id, newStatus, customFieldName);
        } else {
            warning = 'No CRM contact linked — tag sync skipped';
        }
    } catch (syncErr) {
        console.error('GHL tag sync failed:', syncErr.message);
        warning = `GHL tag sync failed: ${syncErr.message}`;
    }

    console.log(`Updated return ${returnId}: ${previousStatus} -> ${newStatus}`);
    const response: Record<string, any> = {
        success: true,
        returnId: taxReturn.return_id,
        previousStatus,
        newStatus,
    };
    if (warning) response.warning = warning;

    return jsonResponse(response);
}

async function handleAssignPreparer(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    const preparerEmail = data?.preparer_email;

    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });
    if (!preparerEmail) return jsonResponse({ success: false, error: 'preparer_email is required in data' });

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ success: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Look up staff member by email
    const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('staff_id, full_name')
        .eq('firm_id', firmId)
        .eq('email', preparerEmail.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

    if (staffError || !staff) {
        return jsonResponse({ success: false, error: `No active staff found with email: ${preparerEmail}` });
    }

    // Find latest return for this client
    const { data: taxReturn, error: returnError } = await supabase
        .from('tax_returns')
        .select('return_id, assigned_to')
        .eq('client_id', client.client_id)
        .eq('firm_id', firmId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (returnError || !taxReturn) {
        return jsonResponse({ success: false, error: 'No tax return found for this client' });
    }

    const previousPreparer = taxReturn.assigned_to;

    // Update assigned_to
    const { error: updateError } = await supabase
        .from('tax_returns')
        .update({ assigned_to: staff.staff_id, updated_at: new Date().toISOString() })
        .eq('return_id', taxReturn.return_id);

    if (updateError) {
        return jsonResponse({ success: false, error: `Failed to assign preparer: ${updateError.message}` });
    }

    console.log(`Assigned preparer ${staff.full_name} to return ${taxReturn.return_id}`);
    return jsonResponse({
        success: true,
        returnId: taxReturn.return_id,
        preparerName: staff.full_name,
        preparerEmail,
        previousPreparer: previousPreparer || '',
    });
}

async function handleAddNote(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    const note = data?.note;

    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });
    if (!note) return jsonResponse({ success: false, error: 'note is required in data' });

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ success: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Find latest return for this client
    const { data: taxReturn, error: returnError } = await supabase
        .from('tax_returns')
        .select('return_id, internal_notes')
        .eq('client_id', client.client_id)
        .eq('firm_id', firmId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (returnError || !taxReturn) {
        return jsonResponse({ success: false, error: 'No tax return found for this client' });
    }

    // Append note with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const newNote = `[${timestamp} via CRM Workflow] ${note}`;
    const updatedNotes = taxReturn.internal_notes
        ? `${taxReturn.internal_notes}\n${newNote}`
        : newNote;

    const { error: updateError } = await supabase
        .from('tax_returns')
        .update({ internal_notes: updatedNotes, updated_at: new Date().toISOString() })
        .eq('return_id', taxReturn.return_id);

    if (updateError) {
        return jsonResponse({ success: false, error: `Failed to add note: ${updateError.message}` });
    }

    console.log(`Added note to return ${taxReturn.return_id}`);
    return jsonResponse({
        success: true,
        returnId: taxReturn.return_id,
        clientName: client.full_name,
        note: newNote,
    });
}

async function handleRequestDocs(
    supabase: any, extras: any, data: any, firmId: string, ghl: FirmGhl | null, customFieldName: string,
) {
    const contactId = extras?.contactId;
    const categories = data?.categories;

    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ success: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Find latest return
    const { data: taxReturn, error: returnError } = await supabase
        .from('tax_returns')
        .select('return_id, tax_return_status, internal_notes')
        .eq('client_id', client.client_id)
        .eq('firm_id', firmId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (returnError || !taxReturn) {
        return jsonResponse({ success: false, error: 'No tax return found for this client' });
    }

    // Set status to Missing Documents
    const previousStatus = taxReturn.tax_return_status;
    const categoriesList = Array.isArray(categories) ? categories.join(', ') : (categories || '');
    const noteText = categoriesList
        ? `[${new Date().toISOString().split('T')[0]} via CRM Workflow] Documents requested: ${categoriesList}`
        : `[${new Date().toISOString().split('T')[0]} via CRM Workflow] Documents requested`;
    const updatedNotes = taxReturn.internal_notes
        ? `${taxReturn.internal_notes}\n${noteText}`
        : noteText;

    const { error: updateError } = await supabase
        .from('tax_returns')
        .update({
            tax_return_status: 'Missing Documents',
            internal_notes: updatedNotes,
            updated_at: new Date().toISOString(),
        })
        .eq('return_id', taxReturn.return_id);

    if (updateError) {
        return jsonResponse({ success: false, error: `Failed to update return: ${updateError.message}` });
    }

    // Sync tag to GHL (best-effort)
    try {
        if (client.ghl_contact_id && ghl) {
            await syncContactStatus(ghl, client.ghl_contact_id, 'Missing Documents', customFieldName);
        }
    } catch (syncErr) {
        console.warn('GHL tag sync skipped:', syncErr.message);
    }

    console.log(`Requested docs for return ${taxReturn.return_id}, status: ${previousStatus} -> Missing Documents`);
    return jsonResponse({
        success: true,
        returnId: taxReturn.return_id,
        clientName: client.full_name,
        previousStatus,
        newStatus: 'Missing Documents',
        categories: categoriesList,
    });
}

async function handleSetReturnInfo(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    const taxYear = data?.tax_year;
    const returnType = data?.return_type;

    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });
    if (!taxYear && !returnType) {
        return jsonResponse({ success: false, error: 'At least one of tax_year or return_type is required in data' });
    }

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ success: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Try to find an existing return to update
    const { data: existingReturn } = await supabase
        .from('tax_returns')
        .select('return_id, tax_year, return_type')
        .eq('client_id', client.client_id)
        .eq('firm_id', firmId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingReturn) {
        // Update existing return
        const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
        if (taxYear) updateFields.tax_year = taxYear;
        if (returnType) updateFields.return_type = returnType;

        const { error: updateError } = await supabase
            .from('tax_returns')
            .update(updateFields)
            .eq('return_id', existingReturn.return_id);

        if (updateError) {
            return jsonResponse({ success: false, error: `Failed to update return: ${updateError.message}` });
        }

        console.log(`Updated return info for ${existingReturn.return_id}`);
        return jsonResponse({
            success: true,
            returnId: existingReturn.return_id,
            clientName: client.full_name,
            taxYear: taxYear || existingReturn.tax_year,
            returnType: returnType || existingReturn.return_type,
            action: 'updated',
        });
    }

    // No existing return — create one
    if (!taxYear || !returnType) {
        return jsonResponse({
            success: false,
            error: 'No existing return found. Both tax_year and return_type are required to create a new return.',
        });
    }

    const { data: newReturn, error: insertError } = await supabase
        .from('tax_returns')
        .insert({
            client_id: client.client_id,
            firm_id: firmId,
            tax_year: taxYear,
            return_type: returnType,
            tax_return_status: 'Intake Received',
        })
        .select('return_id')
        .single();

    if (insertError) {
        return jsonResponse({ success: false, error: `Failed to create return: ${insertError.message}` });
    }

    console.log(`Created return ${newReturn.return_id} via set-return-info`);
    return jsonResponse({
        success: true,
        returnId: newReturn.return_id,
        clientName: client.full_name,
        taxYear,
        returnType,
        action: 'created',
    });
}

async function handleDeactivateClient(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    if (!contactId) return jsonResponse({ success: false, error: 'contactId is required in extras' });

    // Find client
    const { client, error: clientError } = await findClientByContactId(supabase, firmId, contactId);
    if (!client) {
        return jsonResponse({ success: false, error: clientError || `No client found for contact ${contactId}` });
    }

    // Deactivate client
    const { error: updateError } = await supabase
        .from('clients')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('client_id', client.client_id);

    if (updateError) {
        return jsonResponse({ success: false, error: `Failed to deactivate client: ${updateError.message}` });
    }

    console.log(`Deactivated client ${client.client_id} (${client.full_name})`);
    return jsonResponse({
        success: true,
        clientId: client.client_id,
        clientName: client.full_name,
        clientEmail: client.email,
    });
}

async function handleCreateTask(
    supabase: any, extras: any, data: any, firmId: string,
) {
    const contactId = extras?.contactId;
    const title = data?.title;
    const description = data?.description || '';
    const priority = data?.priority || 'Medium';
    const dueDate = data?.due_date || null;

    if (!title) return jsonResponse({ success: false, error: 'title is required in data' });

    // Validate priority
    const validPriorities = ['Low', 'Medium', 'High'];
    const normalizedPriority = validPriorities.find(p => p.toLowerCase() === (priority || '').toLowerCase()) || 'Medium';

    // Determine task type and get assignee
    let taskType: 'firm' | 'client' = 'firm';
    let assignedTo = '';

    if (contactId) {
        // If contactId provided, find the client and create a client-type task
        const { client } = await findClientByContactId(supabase, firmId, contactId);
        if (client) {
            taskType = 'client';
            // Assign to the client's auth_user_id if available, otherwise leave for firm assignment
            const { data: clientRecord } = await supabase
                .from('clients')
                .select('auth_user_id')
                .eq('client_id', client.client_id)
                .maybeSingle();
            assignedTo = clientRecord?.auth_user_id || '';
        }
    }

    // If assign_to email is provided, look up staff
    if (data?.assign_to_email) {
        const { data: staff } = await supabase
            .from('staff')
            .select('auth_user_id')
            .eq('firm_id', firmId)
            .eq('email', data.assign_to_email.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();
        if (staff?.auth_user_id) {
            assignedTo = staff.auth_user_id;
            taskType = 'firm';
        }
    }

    // Insert task
    const { data: newTask, error: insertError } = await supabase
        .from('tasks')
        .insert({
            firm_id: firmId,
            title,
            description,
            type: taskType,
            priority: normalizedPriority,
            assigned_to: assignedTo,
            is_completed: false,
        })
        .select('task_id, title, type, priority')
        .single();

    if (insertError) {
        return jsonResponse({ success: false, error: `Failed to create task: ${insertError.message}` });
    }

    console.log(`Created task ${newTask.task_id}: "${title}"`);
    return jsonResponse({
        success: true,
        taskId: newTask.task_id,
        title: newTask.title,
        type: newTask.type,
        priority: newTask.priority,
    });
}

// =====================================================
// MAIN ENTRYPOINT
// =====================================================

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        let body;
        try {
            body = await req.json();
        } catch {
            return failure(400, 'Body must be JSON.');
        }

        const validated = validateActionRequest(body);
        if (!validated.ok) return failure(400, validated.error);
        const actionKey = validated.key;
        const { data, extras } = body;

        console.log(`crm-actions: received action=${actionKey}, locationId=${validated.locationId}`);

        const supabase = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Resolve location -> connection -> firm, then check that firm's own secret
        const connection = await getConnectionByLocation(supabase, validated.locationId);
        if (!connection) {
            return failure(401, 'This GHL sub-account is not connected to FilersHub.');
        }
        const expectedSecret = connection.actions_secret_id
            ? (await vaultRead(supabase, connection.actions_secret_id)) ?? ''
            : '';
        if (!secretsMatch(expectedSecret, bearerFrom(req.headers.get('Authorization')))) {
            return failure(401, 'Unauthorized');
        }
        const firmId = connection.firm_id;

        // Per-firm GHL client (null when the token is missing)
        let ghl: FirmGhl | null = null;
        try {
            ghl = await firmGhl(supabase, firmId);
        } catch (ghlErr) {
            if (!(ghlErr instanceof GhlNotConnectedError)) throw ghlErr;
            // GHL access is required for actions that call the GHL API
            if (['fh_newclientaccess', 'update_return_stage', 'request_docs'].includes(actionKey)) {
                return jsonResponse({ success: false, error: ghlErr.message });
            }
            console.warn('GHL connection unavailable, proceeding without GHL API access:', ghlErr.message);
        }

        const { data: firmConfig } = await supabase
            .from('firms')
            .select('ghl_custom_field_name')
            .eq('firm_id', firmId)
            .maybeSingle();
        const customFieldName = firmConfig?.ghl_custom_field_name || 'Return Status';

        switch (actionKey) {
            case 'fh_newclientaccess':
                return await handleCreateClient(supabase, extras, data, firmId, ghl);
            case 'create_tax_return':
                return await handleCreateTaxReturn(supabase, extras, data, firmId);
            case 'search_existing_return':
                return await handleSearchExistingReturn(supabase, extras, data, firmId);
            case 'update_return_stage':
                return await handleUpdateReturnStage(supabase, extras, data, firmId, ghl, customFieldName);
            case 'assign_preparer':
                return await handleAssignPreparer(supabase, extras, data, firmId);
            case 'add_note':
                return await handleAddNote(supabase, extras, data, firmId);
            case 'request_docs':
                return await handleRequestDocs(supabase, extras, data, firmId, ghl, customFieldName);
            case 'set_return_info':
                return await handleSetReturnInfo(supabase, extras, data, firmId);
            case 'deactivate_client':
                return await handleDeactivateClient(supabase, extras, data, firmId);
            case 'create_task':
                return await handleCreateTask(supabase, extras, data, firmId);
            default:
                return jsonResponse({ success: false, error: `Unknown action key: ${actionKey}` });
        }

    } catch (error) {
        console.error('crm-actions error:', error?.message || error);
        return jsonResponse({ success: false, error: error?.message || 'Unknown error' });
    }
});
