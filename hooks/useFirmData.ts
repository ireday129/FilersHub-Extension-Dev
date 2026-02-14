import { useState, useEffect, useCallback } from 'react';
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

    const [firmSettings, setFirmSettings] = useState({
        name: '',
        logo: '',
        color: ''
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
                    color: '#42ab31'
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
                        paymentStatus: 'Paid',
                        paymentType: 'CC'
                    }
                ]);
                setLoading(false);
                return;
            }

            // 1. Get ALL Staff Member entries for this user
            const { data: staffEntries, error: staffError } = await supabase
                .from('staff')
                .select('firm_id, role, full_name, avatar_url')
                .eq('auth_user_id', user.id);

            // 1b. Get ALL Client entries for this user
            const { data: clientEntries, error: clientError } = await supabase
                .from('clients')
                .select('firm_id, full_name')
                .eq('auth_user_id', user.id);

            const allFirmsMap = new Map();

            // Process Staff Roles
            if (staffEntries) {
                for (const entry of staffEntries) {
                    if (!allFirmsMap.has(entry.firm_id)) {
                        allFirmsMap.set(entry.firm_id, {
                            id: entry.firm_id,
                            role: entry.role,
                            name: '', // Will fetch below
                            logo: '',
                            brandColor: '',
                            isStaff: true
                        });
                        // Set avatar from first staff entry found
                        if (entry.avatar_url && !userAvatar) setUserAvatar(entry.avatar_url);
                    }
                }
            }

            // Process Client Roles
            if (clientEntries) {
                for (const entry of clientEntries) {
                    if (!allFirmsMap.has(entry.firm_id)) {
                        allFirmsMap.set(entry.firm_id, {
                            id: entry.firm_id,
                            role: 'Client', // Explicitly mark as client
                            name: '',
                            logo: '',
                            brandColor: '',
                            isStaff: false
                        });
                    }
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
            const { data: firmsDetails } = await supabase
                .from('firms')
                .select('firm_id, firm_name, logo_url, brand_color')
                .in('firm_id', firmIds);

            if (firmsDetails) {
                firmsDetails.forEach(f => {
                    if (allFirmsMap.has(f.firm_id)) {
                        const existing = allFirmsMap.get(f.firm_id);
                        existing.name = f.firm_name;
                        existing.logo = f.logo_url;
                        existing.brandColor = f.brand_color;
                    }
                });
            }

            const firmsList = Array.from(allFirmsMap.values());
            setAvailableFirms(firmsList);

            // Auto-select if only one firm
            if (firmsList.length === 1) {
                await selectFirm(firmsList[0].id); // Call selectFirm logic
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

    const selectFirm = async (selectedId: string) => {
        setLoading(true);
        try {
            const selectedFirm = availableFirms.find(f => f.id === selectedId);
            if (!selectedFirm) throw new Error("Invalid firm selection");

            setFirmId(selectedId);
            setFirmSettings({
                name: selectedFirm.name,
                logo: selectedFirm.logo || '',
                color: selectedFirm.brandColor || '#3b82f6'
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
                    year: '2024',
                    type: 'Individual 1040',
                    status: client.tax_return_status as TaxReturnStatus,
                    preparer: 'Sarah Johnson',
                    date: new Date(client.updated_at).toLocaleDateString(),
                    amount: 'N/A',
                    agi: 'N/A',
                    federalBalance: 'N/A',
                    stateBalance: 'N/A',
                    paymentType: 'Invoice',
                    files: files,
                    internalNotes: ''
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
        // Only fetch on mount if no firm selected and not loading
        if (user && !firmId && !loading && availableFirms.length === 0) {
            fetchData();
        }
    }, [user]);

    return { returns, setReturns, loading, refresh: fetchData, firmId, firmSettings, setFirmSettings, userAvatar, setUserAvatar, availableFirms, selectFirm };
};
