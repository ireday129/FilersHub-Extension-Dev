import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { TaxReturn, TaxReturnStatus, TaxDocument, DocStatus, FirmOption } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const useFirmData = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [returns, setReturns] = useState<TaxReturn[]>([]);
    const [firmId, setFirmId] = useState<string | null>(null);
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [availableFirms, setAvailableFirms] = useState<FirmOption[]>([]);
    const hasFetchedRef = useRef(false);
    const clientRoleSyncedRef = useRef(false);

    const [staffName, setStaffName] = useState<string>('');

    const [firmSettings, setFirmSettings] = useState({
        name: '',
        logo: '',
        color: '',
        slug: '',
        portalMessage: '',
        irsAlertsEnabled: false
    });

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            // Bypass Mode Check
            if (user.id === 'dev-bypass-user') {
                setFirmId('dev-firm-id');
                setFirmSettings({
                    name: 'Dev Mode Firm',
                    logo: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png',
                    color: '#42ab31',
                    slug: 'dev-firm',
                    portalMessage: ''
                });
                // Mock Returns
                setReturns([
                    {
                        id: 'dev-return-1',
                        clientId: 'dev-client-1',
                        clientName: 'Dev Client A',
                        year: '2024',
                        type: '1040',
                        status: TaxReturnStatus.InPreparation,
                        preparer: 'Dev User',
                        date: new Date().toLocaleDateString(),
                        amount: '$500',
                        agi: '$150,000',
                        federalBalance: 'N/A',
                        stateBalance: 'N/A',
                        files: [],
                        paymentType: 'CC'
                    }
                ]);
                setLoading(false);
                return;
            }

            // 1. Get ALL Staff Member entries for this user
            const { data: staffEntries, error: staffError } = await supabase
                .from('staff')
                .select('firm_id, role, full_name')
                .eq('auth_user_id', user.id);

            if (staffError) {
                console.error("Staff query error:", staffError);
            }

            // 1b. Get ALL Client entries for this user
            let clientEntries: any[] | null = null;
            const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('firm_id, full_name')
                .eq('auth_user_id', user.id);

            clientEntries = clientData;

            // 1c. Email fallback: if no client entries found by auth_user_id, try linking via RPC
            if ((!clientEntries || clientEntries.length === 0) && user.email) {
                const metaFirmId = user.user_metadata?.firm_id || null;

                try {
                    const { data: linkResult } = await supabase.rpc('link_client_auth', {
                        p_email: user.email.toLowerCase(),
                        p_firm_id: metaFirmId
                    });

                    if (linkResult?.success) {
                        // Re-query after successful linking
                        const { data: linkedEntries } = await supabase
                            .from('clients')
                            .select('firm_id, full_name')
                            .eq('auth_user_id', user.id);
                        clientEntries = linkedEntries;
                    }
                } catch (linkErr) {
                    console.warn('Client email fallback link failed:', linkErr);
                }
            }

            const allFirmsMap = new Map<string, FirmOption>();

            // Process Staff Roles
            if (staffEntries) {
                for (const entry of staffEntries) {
                    if (!allFirmsMap.has(entry.firm_id)) {
                        allFirmsMap.set(entry.firm_id, {
                            id: entry.firm_id,
                            role: entry.role,
                            staffName: entry.full_name || '',
                            name: '', // Will fetch below
                            logo: '',
                            brandColor: '',
                            slug: '',
                            isStaff: true,
                            irsAlertsEnabled: false
                        });
                    }
                }
            }

            // Process Client Roles
            if (clientEntries) {
                for (const entry of clientEntries) {
                    if (!allFirmsMap.has(entry.firm_id)) {
                        allFirmsMap.set(entry.firm_id, {
                            id: entry.firm_id,
                            role: 'Client',
                            name: '',
                            logo: '',
                            brandColor: '',
                            slug: '',
                            isStaff: false,
                            irsAlertsEnabled: false,
                            ghlAlertWebhookUrl: null
                        });
                    }
                }
            }

            // Sync role to user metadata — deferred to a separate effect to avoid re-render loops
            if (allFirmsMap.size > 0) {
                const firstFirm = Array.from(allFirmsMap.values())[0];
                if (firstFirm.role === 'Client' && user.user_metadata?.role !== 'Client' && !clientRoleSyncedRef.current) {
                    clientRoleSyncedRef.current = true;
                    // Fire-and-forget: don't await to avoid triggering onAuthStateChange mid-fetch
                    supabase.auth.updateUser({ data: { role: 'Client' } }).catch(console.error);
                }
            }

            // If no firms found
            if (allFirmsMap.size === 0) {
                console.warn("User has no firm associations");
                setLoading(false);
                return;
            }

            // Fetch details for all found firms
            const firmIds = Array.from(allFirmsMap.keys());
            const { data: firmsDetails, error: firmsError } = await supabase
                .from('firms')
                .select('firm_id, firm_name, logo_url, brand_color, slug, portal_message, irs_alerts_enabled, ghl_alert_webhook_url')
                .in('firm_id', firmIds);

            if (firmsError) {
                console.error("Firms query error:", firmsError);
            }

            if (firmsDetails) {
                firmsDetails.forEach(f => {
                    if (allFirmsMap.has(f.firm_id)) {
                        const existing = allFirmsMap.get(f.firm_id);
                        existing.name = f.firm_name;
                        existing.logo = f.logo_url;
                        existing.brandColor = f.brand_color;
                        existing.slug = f.slug || '';
                        existing.portalMessage = f.portal_message || '';
                        existing.irsAlertsEnabled = f.irs_alerts_enabled || false;
                        existing.ghlAlertWebhookUrl = f.ghl_alert_webhook_url || null;
                    }
                });
            }

            const firmsList = Array.from(allFirmsMap.values());
            setAvailableFirms(firmsList);

            // Auto-select if only one firm
            if (firmsList.length === 1) {
                await selectFirm(firmsList[0].id, firmsList); // Pass list directly (state not yet updated)
            } else {
                // If multiple, we stop here and let the UI prompt selection.
                // firmId remains null, so App.tsx can show selection screen.
                setLoading(false);
            }

        } catch (error) {
            console.error('Error fetching firm data:', error);
            setLoading(false);
        }
    }, [user]); // Removed userAvatar dependency to avoid loops

    const selectFirm = async (selectedId: string, firmList?: FirmOption[]) => {
        setLoading(true);
        try {
            const list = firmList || availableFirms;
            const selectedFirm = list.find(f => f.id === selectedId);
            if (!selectedFirm) throw new Error("Invalid firm selection");

            setFirmId(selectedId);
            setStaffName(selectedFirm.staffName || '');
            setFirmSettings({
                name: selectedFirm.name,
                logo: selectedFirm.logo || '',
                color: selectedFirm.brandColor || '#3b82f6',
                slug: selectedFirm.slug || '',
                portalMessage: selectedFirm.portalMessage || '',
                irsAlertsEnabled: selectedFirm.irsAlertsEnabled || false
            });

            // Now load data SPECIFIC to this firm and role

            // 2. Fetch Clients for this firm
            let clientsData: any[] = [];
            if (selectedFirm.isStaff) {
                const { data, error } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('firm_id', selectedId);
                if (error) throw error;
                clientsData = data || [];
            } else {
                const { data, error } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('firm_id', selectedId)
                    .eq('auth_user_id', user?.id)
                    .single();
                if (data) clientsData = [data];
            }

            // 3. Fetch Tax Returns for this firm
            let returnsData: any[] = [];
            if (selectedFirm.isStaff) {
                const { data, error } = await supabase
                    .from('tax_returns')
                    .select('*')
                    .eq('firm_id', selectedId);
                if (error) throw error;
                returnsData = data || [];
            } else {
                // Client: only fetch returns for their own client records
                const clientIds = clientsData.map(c => c.client_id);
                if (clientIds.length > 0) {
                    const { data, error } = await supabase
                        .from('tax_returns')
                        .select('*')
                        .in('client_id', clientIds);
                    if (error) throw error;
                    returnsData = data || [];
                }
            }

            // 4. Fetch Documents for this firm
            const { data: docsData, error: docsError } = await supabase
                .from('documents')
                .select('*')
                .eq('firm_id', selectedId)
                .eq('is_deleted', false);

            if (docsError) throw docsError;

            // 5. Build a client lookup map
            const clientsMap = new Map<string, any>();
            clientsData.forEach(c => clientsMap.set(c.client_id, c));

            // 6. Map tax_returns rows to TaxReturn[]
            const clientIdsWithReturns = new Set<string>();
            const mappedReturns: TaxReturn[] = returnsData.map((ret: any) => {
                clientIdsWithReturns.add(ret.client_id);
                const client = clientsMap.get(ret.client_id);

                // Match docs: prefer return_id match, fallback to client_id for unassociated docs
                const returnDocs = docsData ? docsData.filter((doc: any) =>
                    doc.return_id === ret.return_id || (doc.client_id === ret.client_id && !doc.return_id)
                ) : [];

                const files = returnDocs.map((doc: any) => ({
                    name: doc.file_name,
                    size: (doc.file_size / 1024 / 1024).toFixed(2) + ' MB',
                    type: doc.file_type.toUpperCase(),
                    status: 'Uploaded' as DocStatus,
                    signatureStatus: (doc.requires_signature ? (doc.signature_id ? 'Signed' : 'Pending') : 'None') as 'Signed' | 'Pending' | 'None'
                }));

                return {
                    id: ret.return_id,
                    clientId: ret.client_id,
                    clientName: client?.full_name || '',
                    clientAvatar: client?.avatar_url || '',
                    year: ret.tax_year || '',
                    type: ret.return_type || '',
                    status: ret.tax_return_status as TaxReturnStatus,
                    preparer: ret.assigned_to || '',
                    date: new Date(ret.updated_at).toLocaleDateString(),
                    amount: 'N/A',
                    agi: ret.agi || 'N/A',
                    federalBalance: ret.federal_balance || 'N/A',
                    stateBalance: ret.state_balance || 'N/A',
                    paymentType: ret.payment_type || 'Invoice',
                    files: files,
                    internalNotes: ret.internal_notes || ''
                };
            });

            // 7. Add placeholder entries for clients with NO returns (so they appear in client list)
            clientsData.forEach((client: any) => {
                if (!clientIdsWithReturns.has(client.client_id)) {
                    mappedReturns.push({
                        id: client.client_id, // placeholder uses client_id as id
                        clientId: client.client_id,
                        clientName: client.full_name,
                        clientAvatar: client.avatar_url || '',
                        year: '',
                        type: '',
                        status: TaxReturnStatus.IntakeReceived,
                        preparer: '',
                        date: new Date(client.updated_at).toLocaleDateString(),
                        amount: 'N/A',
                        agi: 'N/A',
                        federalBalance: 'N/A',
                        stateBalance: 'N/A',
                        paymentType: 'Invoice',
                        files: [],
                        internalNotes: ''
                    });
                }
            });

            setReturns(mappedReturns);
        } catch (err) {
            console.error("Error selecting firm:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchData();
        }
    }, [user, fetchData]);

    return { returns, setReturns, loading, refresh: fetchData, firmId, firmSettings, setFirmSettings, userAvatar, setUserAvatar, availableFirms, selectFirm, staffName };
};
