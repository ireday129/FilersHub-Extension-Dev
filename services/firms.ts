
import { supabase } from './supabase';

export interface PublicFirmData {
    firm_id: string;
    firm_name: string;
    logo_url: string;
    brand_color: string;
    slug: string;
    portal_message: string | null;
}

export const getFirmBySlug = async (slug: string): Promise<PublicFirmData | null> => {
    const { data, error } = await supabase
        .from('firms')
        .select('firm_id, firm_name, logo_url, brand_color, slug, portal_message')
        .eq('slug', slug)
        .single();

    if (error) {
        console.error('Error fetching firm by slug:', error);
        return null;
    }

    return data;
};
