// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const TAG_PREFIX = 'fh-status:';

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

async function resolveLocation(supabase: any, locationId: string | undefined) {
    if (!locationId) return { firmId: null, error: 'No locationId provided in extras' };

    const { data: firm, error } = await supabase
        .from('firms')
        .select('firm_id')
        .eq('ghl_location_id', locationId)
        .maybeSingle();

    if (error) return { firmId: null, error: `Database error: ${error.message}` };
    if (!firm) return { firmId: null, error: `No firm found for locationId: ${locationId}` };

    return { firmId: firm.firm_id, error: null };
}

async function getValidToken(supabase: any, firmId: string): Promise<{ accessToken: string; locationId: string }> {
    const { data: integData, error } = await supabase
        .from('integrations_ghl')
        .select('access_token, refresh_token, token_expires_at, location_id')
        .eq('firm_id', firmId)
        .maybeSingle();

    if (error) throw new Error(`Token lookup failed: ${error.message}`);
    if (!integData?.access_token) throw new Error('No GHL access token found. Please connect GHL in Settings.');
    if (!integData.location_id) throw new Error('No GHL location ID found. Please reconnect GHL.');

    let accessToken = integData.access_token;

    if (integData.token_expires_at && new Date(integData.token_expires_at) < new Date()) {
        console.log('Token expired, refreshing...');
        const refreshResp = await fetch(`${GHL_API_BASE}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: Deno.env.get('GHL_CLIENT_ID')!,
                client_secret: Deno.env.get('GHL_CLIENT_SECRET')!,
                grant_type: 'refresh_token',
                refresh_token: integData.refresh_token,
            }),
        });

        if (!refreshResp.ok) {
            const errText = await refreshResp.text();
            console.error('Token refresh failed:', refreshResp.status, errText);
            throw new Error('GHL token expired and refresh failed. Please reconnect the CRM integration.');
        }

        const refreshData = await refreshResp.json();
        accessToken = refreshData.access_token;
        const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

        await supabase.from('integrations_ghl').update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token,
            token_expires_at: newExpiry,
        }).eq('firm_id', firmId);

        console.log('Token refreshed successfully');
    }

    return { accessToken, locationId: integData.location_id };
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

async function syncStatusTagToGhl(
    supabase: any,
    accessToken: string,
    contactId: string,
    newStatus: string,
    firmId: string,
) {
    const ghlHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'Version': GHL_API_VERSION,
        'Content-Type': 'application/json',
    };

    // Fetch current contact tags
    const contactResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Version': GHL_API_VERSION },
    });

    if (!contactResp.ok) {
        throw new Error(`GHL contact fetch failed (${contactResp.status})`);
    }

    const contactData = await contactResp.json();
    const existingTags: string[] = contactData.contact?.tags || [];

    // Strip old fh-status tags, add new one
    const newStatusTag = `${TAG_PREFIX}${newStatus.toLowerCase().replace(/\s+/g, '-')}`;
    const updatedTags = existingTags.filter((t: string) => !t.startsWith(TAG_PREFIX));
    updatedTags.push(newStatusTag);

    // Get firm custom field config
    const { data: firmConfig } = await supabase
        .from('firms')
        .select('ghl_custom_field_name')
        .eq('firm_id', firmId)
        .maybeSingle();

    const customFieldName = firmConfig?.ghl_custom_field_name || 'Return Status';

    // Update contact: tags + custom field
    const updatePayload: Record<string, any> = { tags: updatedTags };
    if (customFieldName) {
        updatePayload.customFields = [{ key: customFieldName, field_value: newStatus }];
    }

    const updateResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify(updatePayload),
    });

    if (!updateResp.ok) {
        throw new Error(`GHL contact update failed (${updateResp.status})`);
    }

    console.log(`GHL tag sync: contact=${contactId}, tag=${newStatusTag}`);
}

// =====================================================
// ACTION HANDLERS
// =====================================================

async function handleCreateClient(
    supabase: any, extras: any, data: any, firmId: string, accessToken: string,
) {
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
    const contactResp = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Version': GHL_API_VERSION },
    });

    if (!contactResp.ok) {
        return jsonResponse({
            success: false,
            error: `Failed to fetch contact from GHL (${contactResp.status})`,
        });
    }

    const contactData = await contactResp.json();
    const contact = contactData.contact || contactData;

    const fullName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const email = contact.email || '';
    const phone = contact.phone || null;

    if (!email) {
        return jsonResponse({ success: false, error: 'Contact has no email address in GHL' });
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
    supabase: any, extras: any, data: any, firmId: string, accessToken: string,
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

        if (client?.ghl_contact_id) {
            await syncStatusTagToGhl(supabase, accessToken, client.ghl_contact_id, newStatus, firmId);
        } else {
            warning = 'No GHL contact linked — tag sync skipped';
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

// =====================================================
// MAIN ENTRYPOINT
// =====================================================

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { data, extras, meta } = body;
        const actionKey = meta?.key;

        console.log(`crm-actions: received action=${actionKey}, locationId=${extras?.locationId}`);

        const supabase = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Resolve location -> firm
        const { firmId, error: locationError } = await resolveLocation(supabase, extras?.locationId);
        if (locationError || !firmId) {
            return jsonResponse({ success: false, error: locationError || 'Could not resolve firm' });
        }

        // Get valid GHL token
        let accessToken = '';
        try {
            const tokenResult = await getValidToken(supabase, firmId);
            accessToken = tokenResult.accessToken;
        } catch (tokenErr) {
            // Token is only required for create_client and update_return_stage
            if (actionKey === 'fh_newclientaccess' || actionKey === 'update_return_stage') {
                return jsonResponse({ success: false, error: tokenErr.message });
            }
            console.warn('Token unavailable, proceeding without GHL API access:', tokenErr.message);
        }

        switch (actionKey) {
            case 'fh_newclientaccess':
                return await handleCreateClient(supabase, extras, data, firmId, accessToken);
            case 'create_tax_return':
                return await handleCreateTaxReturn(supabase, extras, data, firmId);
            case 'search_existing_return':
                return await handleSearchExistingReturn(supabase, extras, data, firmId);
            case 'update_return_stage':
                return await handleUpdateReturnStage(supabase, extras, data, firmId, accessToken);
            default:
                return jsonResponse({ success: false, error: `Unknown action key: ${actionKey}` });
        }

    } catch (error) {
        console.error('crm-actions error:', error?.message || error);
        return jsonResponse({ success: false, error: error?.message || 'Unknown error' });
    }
});
