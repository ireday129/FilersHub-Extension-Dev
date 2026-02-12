import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { TaxReturn, TaxReturnStatus, TaxDocument, DocStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const useFirmData = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [returns, setReturns] = useState<TaxReturn[]>([]);
    const [firmId, setFirmId] = useState<string | null>(null);
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

            // 1. Get Staff Member info to find firm_id
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('firm_id, full_name')
                .eq('auth_user_id', user.id)
                .single();

            if (staffError) {
                // If not found in staff, maybe it's a client?
                // For V1 we assume staff login for the main dashboard view
                console.error('Error fetching staff record:', staffError);
                setLoading(false);
                return;
            }

            setFirmId(staffData.firm_id);

            // 1b. Fetch Firm Settings
            const { data: firmData } = await supabase
                .from('firms')
                .select('firm_name, logo_url, brand_color')
                .eq('firm_id', staffData.firm_id)
                .single();

            if (firmData) {
                setFirmSettings({
                    name: firmData.firm_name,
                    logo: firmData.logo_url || '',
                    color: firmData.brand_color || '#3b82f6'
                });
            }

            // 2. Fetch Clients for this firm
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('*')
                .eq('firm_id', staffData.firm_id);

            if (clientsError) throw clientsError;

            // 3. Fetch Documents for this firm
            const { data: docsData, error: docsError } = await supabase
                .from('documents')
                .select('*')
                .eq('firm_id', staffData.firm_id)
                .eq('is_deleted', false);

            if (docsError) throw docsError;

            // 4. Map to TaxReturn type
            const mappedReturns: TaxReturn[] = clientsData.map((client: any) => {
                const clientDocs = docsData.filter((doc: any) => doc.client_id === client.client_id);

                const files = clientDocs.map((doc: any) => ({
                    name: doc.file_name,
                    size: (doc.file_size / 1024 / 1024).toFixed(2) + ' MB',
                    type: doc.file_type.toUpperCase(),
                    status: 'Uploaded' as DocStatus, // Default status as DB doesn't have doc status yet
                    signatureStatus: (doc.requires_signature ? (doc.signature_id ? 'Signed' : 'Pending') : 'None') as 'Signed' | 'Pending' | 'None'
                }));

                return {
                    id: client.client_id,
                    clientName: client.full_name,
                    year: '2024', // Default
                    type: 'Individual 1040', // Default
                    status: client.tax_return_status as TaxReturnStatus,
                    preparer: 'Sarah Johnson', // Default to Sarah for demo/visibility in Dashboard active view
                    date: new Date(client.updated_at).toLocaleDateString(),
                    amount: 'N/A',
                    agi: 'N/A',
                    federalBalance: 'N/A',
                    stateBalance: 'N/A',
                    paymentType: 'Invoice',
                    files: files,
                    internalNotes: '' // Default
                };
            });

            setReturns(mappedReturns);

        } catch (error) {
            console.error('Error fetching firm data:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { returns, setReturns, loading, refresh: fetchData, firmId, firmSettings, setFirmSettings };
};
