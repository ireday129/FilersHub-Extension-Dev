import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { Upload, User, Shield, Mail, Save, Loader2 } from 'lucide-react';

interface ProfileProps {
    role: UserRole;
}

const Profile: React.FC<ProfileProps> = ({ role }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.user_metadata?.avatar_url || null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (user?.user_metadata) {
            setFullName(user.user_metadata.full_name || '');
            setAvatarUrl(user.user_metadata.avatar_url || null);
        }
    }, [user]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            // Update auth metadata
            const { error: updateError } = await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            if (updateError) throw updateError;

            setAvatarUrl(publicUrl);

            // Also try to update staff table if it exists
            await supabase
                .from('staff')
                .update({ avatar_url: publicUrl })
                .eq('auth_user_id', user.id);

        } catch (error) {
            console.error('Error uploading avatar:', error);
            alert('Failed to update profile picture.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { full_name: fullName }
            });

            if (error) throw error;

            // Also try to update staff table if it exists
            await supabase
                .from('staff')
                .update({ name: fullName })
                .eq('auth_user_id', user.id);

            alert('Profile updated successfully!');
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <User className="text-brand" size={20} />
                        My Profile
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Manage your personal information and account settings.</p>
                </div>

                <div className="p-6 space-y-8">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-slate-100">
                                <img
                                    src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`}
                                    alt="Profile"
                                    className="w-full h-full object-cover transition-opacity duration-300"
                                />
                            </div>
                            <label className="absolute bottom-0 right-0 p-2 bg-brand text-white rounded-full cursor-pointer hover:bg-brand/90 transition-all shadow-md hover:scale-105 active:scale-95">
                                <Upload size={14} />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    disabled={isUploading}
                                    className="hidden"
                                />
                            </label>
                            {isUploading && (
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-brand uppercase tracking-wider">Profile Photo</p>
                            <p className="text-[10px] text-slate-400 mt-1">Click the icon to upload a new photo</p>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <User size={14} className="text-slate-400" />
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand focus:bg-white outline-none transition-all placeholder:font-normal"
                                placeholder="Enter your full name"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <Mail size={14} className="text-slate-400" />
                                Email Address
                            </label>
                            <div className="w-full px-4 py-2.5 bg-slate-100/50 border border-slate-200 rounded-xl text-sm font-medium text-slate-500 cursor-not-allowed">
                                {user?.email}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Email cannot be changed directly for security reasons.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <Shield size={14} className="text-slate-400" />
                                Role
                            </label>
                            <div className="w-full px-4 py-2 bg-slate-100/50 border border-slate-200 rounded-xl flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${role === UserRole.SuperAdmin ? 'bg-purple-100 text-purple-700' :
                                        role === UserRole.FirmOwner ? 'bg-amber-100 text-amber-700' :
                                            role === UserRole.Manager ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-200 text-slate-600'
                                    }`}>
                                    {role}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <button
                            onClick={handleSaveProfile}
                            disabled={loading}
                            className="w-full py-3 bg-brand text-white font-bold rounded-xl hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {loading ? 'Saving Changes...' : 'Save Profile Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
