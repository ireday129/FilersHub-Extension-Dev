import { supabase } from './supabase';
import { DocStatus } from '../types';

export const uploadDocument = async (
    file: File,
    clientId: string,
    firmId: string,
    docType: string
) => {
    try {
        // 1. Upload to Storage
        // Bucket structure: firm_id/client_id/filename
        const filePath = `${firmId}/${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        const { data: storageData, error: storageError } = await supabase.storage
            .from('documents')
            .upload(filePath, file);

        if (storageError) throw storageError;

        // 2. Insert into 'documents' table
        const { data: dbData, error: dbError } = await supabase
            .from('documents')
            .insert({
                firm_id: firmId,
                client_id: clientId,
                file_name: file.name,
                file_path: filePath,
                file_type: docType,
                file_size: file.size,
                uploaded_by_user_id: (await supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single();

        if (dbError) throw dbError;

        return dbData;

    } catch (error) {
        console.error('Error uploading document:', error);
        throw error;
    }
};
