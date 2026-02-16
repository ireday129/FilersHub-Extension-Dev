import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { TaxReturn, TaxReturnStatus, TaxDocument, DocStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const useFirmData = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [returns, setReturns] = useState<TaxReturn[]>([]);
    const [firmId, setFirmId] = useState<string | null>(null);
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [availableFirms, setAvailableFirms] = useState<any[]>([]);
    const hasFetchedRef = useRef(false);
    const clientRoleSyncedRef = useRef(false);

    const [staffName, setStaffName] = useState<string>('');

    const [firmSettings, setFirmSettings] = useState({
        name: '',
        logo: '',
        color: '',
        slug: '',
        portalMessage: ''
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
                        id: 'dev-client-1',
                        clientName: 'Dev Client A',
                        year: '2024',
                        type: '1040',
                        status: TaxReturnStatus.InPreparation,
                        preparer: 'Dev User',
                        date: new Date().toLocaleDateString(),
                        amount: '$500',
                        agi: '$150,000',
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
                const metaRole = user.user_metadata?.role;
                const metaFirmId = user.user_metadata?.firm_id;

                if (metaRole === 'Client' && metaFirmId) {
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
            }

            const allFirmsMap = new Map();

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
                            isStaff: true
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
                            isStaff: false
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
                .select('firm_id, firm_name, logo_url, brand_color, slug, portal_message')
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

    const selectFirm = async (selectedId: string, firmList?: any[]) => {
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
                portalMessage: selectedFirm.portalMessage || ''
            });

            // Now load data SPECIFIC to this firm and role

            // 2. Fetch Clients for this firm (Only if Staff)
            let clientsData: any[] = [];
            if (selectedFirm.isStaff) {
                const { data, error } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('firm_id', selectedId);
                if (error) throw error;
                clientsData = data || [];
            } else {
                // If Client login, only fetch THEIR own client record
                const { data, error } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('firm_id', selectedId)
                    .eq('auth_user_id', user?.id)
                    .single();

                // If error, might mean they are not a client in this firm?? but we checked earlier.
                if (data) clientsData = [data];
            }

            // 3. Fetch Documents for this firm
            const { data: docsData, error: docsError } = await supabase
                .from('documents')
                .select('*')
                .eq('firm_id', selectedId)
                .eq('is_deleted', false);

            if (docsError) throw docsError;

            // 4. Map to TaxReturn type
            const mappedReturns: TaxReturn[] = clientsData.map((client: any) => {
                const clientDocs = docsData ? docsData.filter((doc: any) => doc.client_id === client.client_id) : [];

                const files = clientDocs.map((doc: any) => ({
                    name: doc.file_name,
                    size: (doc.file_size / 1024 / 1024).toFixed(2) + ' MB',
                    type: doc.file_type.toUpperCase(),
                    status: 'Uploaded' as DocStatus,
                    signatureStatus: (doc.requires_signature ? (doc.signature_id ? 'Signed' : 'Pending') : 'None') as 'Signed' | 'Pending' | 'None'
                }));

                return {
                    id: client.client_id,
                    clientName: client.full_name,
                    year: client.tax_year || '',
                    type: client.return_type || '',
                    status: client.tax_return_status as TaxReturnStatus,
                    preparer: client.assigned_to || '',
                    date: new Date(client.updated_at).toLocaleDateString(),
                    amount: 'N/A',
                    agi: client.agi || 'N/A',
                    federalBalance: client.federal_balance || 'N/A',
                    stateBalance: client.state_balance || 'N/A',
                    paymentType: client.payment_type || 'Invoice',
                    files: files,
                    internalNotes: client.internal_notes || ''
                };
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
