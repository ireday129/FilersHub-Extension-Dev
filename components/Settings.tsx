import React, { useState, useEffect } from 'react';
import {
  Upload,
  Palette,
  Users,
  Save,
  Shield,
  Globe,
  Building2,
  Hash,
  CreditCard,
  Check,
  Sparkles,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { UserRole } from '../types';
import { supabase } from '../services/supabase';
import { useExtensionMode } from '../hooks/useExtensionMode';
import { useAuth } from '../contexts/AuthContext';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
}

interface SettingsProps {
  firmSettings: {
    name: string;
    logo: string;
    color: string;
    slug?: string;
    portalMessage?: string;
  };
  setFirmSettings: React.Dispatch<React.SetStateAction<{
    name: string;
    logo: string;
    color: string;
    slug?: string;
    portalMessage?: string;
  }>>;
  firmId: string | null;
}

// ... (omitted)

// In Settings component body:



interface GHLUser {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
  type: string;
  hasAccess: boolean;
  appRole: string | null;
}

const Settings: React.FC<SettingsProps> = ({ firmSettings, setFirmSettings, firmId }) => {
  const { isExtension } = useExtensionMode();
  const { user } = useAuth();
  const [localSettings, setLocalSettings] = useState(firmSettings);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Staff seat limit from DB (fetched from firms.max_staff)
  const [staffLimit, setStaffLimit] = useState(10);

  // Fetch max_staff and subscription_tier from firms table
  useEffect(() => {
    if (!firmId) return;
    supabase
      .from('firms')
      .select('max_staff, subscription_tier')
      .eq('firm_id', firmId)
      .single()
      .then(({ data }) => {
        if (data?.max_staff) setStaffLimit(data.max_staff);
        if (data?.subscription_tier) setSubscriptionTier(data.subscription_tier);
      });
  }, [firmId]);

  useEffect(() => {
    if (!firmId) return;
    const fetchStaff = async () => {
      setStaffLoading(true);
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('staff_id, full_name, email, role, is_active, avatar_url')
          .eq('firm_id', firmId)
          .eq('is_active', true);

        if (error) throw error;

        const currentUserAvatar = user?.user_metadata?.avatar_url || '';
        const currentUserEmail = user?.email?.toLowerCase();
        const mapped: StaffMember[] = (data || []).map((s: any) => ({
          id: s.staff_id,
          name: s.full_name,
          email: s.email,
          role: s.role as UserRole,
          avatar: s.avatar_url || (s.email?.toLowerCase() === currentUserEmail ? currentUserAvatar : '')
        }));
        setStaff(mapped);
      } catch (err) {
        console.error('Error fetching staff:', err);
      } finally {
        setStaffLoading(false);
      }
    };
    fetchStaff();
  }, [firmId]);

  const assignedStaff = staff.filter(m => m.role !== UserRole.FirmOwner).length;

  const [showGHLModal, setShowGHLModal] = useState(false);
  const [ghlUsers, setGhlUsers] = useState<GHLUser[]>([]);
  const [isLoadingGHL, setIsLoadingGHL] = useState(false);
  const [grantStatus, setGrantStatus] = useState<Record<string, 'idle' | 'granting' | 'granted' | 'error'>>({});
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [ghlError, setGhlError] = useState('');
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);

  // Pro plan logo sync state
  const [subscriptionTier, setSubscriptionTier] = useState<string>('starter');
  const [logoSyncStatus, setLogoSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [logoSyncMessage, setLogoSyncMessage] = useState('');
  const isPro = ['pro', 'growth', 'enterprise'].includes(subscriptionTier?.toLowerCase());

  const refreshStaff = async () => {
    if (!firmId) return;
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('staff_id, full_name, email, role, is_active, avatar_url')
        .eq('firm_id', firmId)
        .eq('is_active', true);
      if (!error && data) {
        const currentUserAvatar = user?.user_metadata?.avatar_url || '';
        const currentUserEmail = user?.email?.toLowerCase();
        setStaff(data.map((s: any) => ({
          id: s.staff_id,
          name: s.full_name,
          email: s.email,
          role: s.role as UserRole,
          avatar: s.avatar_url || (s.email?.toLowerCase() === currentUserEmail ? currentUserAvatar : '')
        })));
      }
    } catch (err) {
      console.error('Error refreshing staff:', err);
    }
  };

  // Helper: get a fresh access token, forcing a refresh if needed
  const getFreshToken = async (): Promise<string> => {
    // First try refreshing the session to get a new JWT
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) return session.access_token;
    // Fallback: try getSession (maybe refresh isn't needed)
    const { data: { session: existing } } = await supabase.auth.getSession();
    if (existing?.access_token) return existing.access_token;
    throw new Error('Your session has expired. Please sign out and sign back in.');
  };

  const fetchGHLUsers = async () => {
    setIsLoadingGHL(true);
    setShowGHLModal(true);
    setGhlError('');
    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: { action: 'list' },
        headers: { Authorization: `Bearer ${token}` }
      });

      // Extract detailed error from response body (data) or the generic supabase error
      if (data?.error) throw new Error(data.error);
      if (error) {
        let detail = '';
        try {
          const ctx = await error.context?.json();
          if (ctx?.error) detail = ctx.error;
        } catch (_) { /* no parseable context */ }
        throw new Error(detail || error.message || 'Edge function error');
      }
      setGhlUsers(data?.users || []);
    } catch (error: any) {
      console.error('Error fetching GHL users:', error);
      setGhlError(error.message || 'Failed to load users from CRM.');
    } finally {
      setIsLoadingGHL(false);
    }
  };

  const grantAccess = async (user: GHLUser) => {
    const role = selectedRoles[user.id] || 'Tax Pro';
    setGrantStatus(prev => ({ ...prev, [user.id]: 'granting' }));
    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: {
          action: 'grant',
          ghlUserId: user.id,
          email: user.email,
          name: user.name || `${user.firstName} ${user.lastName}`,
          role,
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      setGrantStatus(prev => ({ ...prev, [user.id]: 'granted' }));
      // Mark as having access in the GHL users list
      setGhlUsers(prev => prev.map(u => u.id === user.id ? { ...u, hasAccess: true, appRole: role } : u));
      // Refresh staff list to update seat count
      await refreshStaff();
    } catch (error: any) {
      console.error('Error granting access:', error);
      setGrantStatus(prev => ({ ...prev, [user.id]: 'error' }));
    }
  };

  const colors = ['#4aa936', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#334155'];

  const computedSlug = localSettings.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const firmSlug = localSettings.slug || computedSlug;

  const portalUrl = `app.filershub.com/portal/${firmSlug || ''}`;

  const handleRoleChange = async (id: string, newRole: UserRole) => {
    setStaff(prev => prev.map(member =>
      member.id === id ? { ...member, role: newRole } : member
    ));
    // Persist role change
    await supabase.from('staff').update({ role: newRole }).eq('staff_id', id);
  };

  const revokeAccess = async (staffId: string) => {
    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: { action: 'revoke', staffId },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      setStaff(prev => prev.filter(m => m.id !== staffId));
    } catch (err: any) {
      console.error('Error revoking access:', err);
      alert('Failed to revoke access.');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firmId) return;

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${firmId}/logo.png`; // Always use logo.png/jpg for simplicity or preserve ext?
      // Let's force a consistent name for easier replacement, but browser cache might be an issue.
      // Better: `${firmId}/logo-${Date.now()}.${fileExt}` store path in DB.
      // But for now, let's try overwriting and using cache busting param.

      const { error: uploadError } = await supabase.storage
        .from('firm-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('firm-assets').getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`; // Cache bust

      setLocalSettings(prev => ({ ...prev, logo: publicUrl }));

    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };


  const syncBrandingToCrm = async (logoUrl: string | null) => {
    if (!firmId || !isPro) return;

    setLogoSyncStatus('syncing');
    setLogoSyncMessage('');

    try {
      // If there's a logo, push it to GHL via crm-logo-sync
      if (logoUrl) {
        const token = await getFreshToken();

        const { data, error } = await supabase.functions.invoke('crm-logo-sync', {
          body: { firmId, logoUrl },
          headers: { Authorization: `Bearer ${token}` }
        });

        // Check for explicit error in response body
        if (data?.error) throw new Error(data.error);

        // Handle generic Supabase relay error — check actual response for success
        if (error) {
          let actualSuccess = false;
          try {
            const body = await error.context?.json();
            if (body?.success) actualSuccess = true;
            else if (body?.error) throw new Error(body.error);
          } catch (parseErr: any) {
            if (parseErr?.message && parseErr.message !== error.message) throw parseErr;
          }
          if (!actualSuccess) throw error;
        }
      }
      // Brand color is already saved to DB — the GHL sidebar script picks it up automatically

      setLogoSyncStatus('success');
      setLogoSyncMessage('Synced to CRM Successfully');
      setTimeout(() => setLogoSyncStatus('idle'), 4000);
    } catch (err: any) {
      console.error('CRM branding sync failed:', err);
      setLogoSyncStatus('error');
      setLogoSyncMessage(err.message || 'Failed to sync branding to CRM');
      setTimeout(() => setLogoSyncStatus('idle'), 6000);
    }
  };

  const handleSave = async () => {
    if (!firmId) return;

    // Optimistic update
    setFirmSettings(localSettings);

    try {
      const { error } = await supabase
        .from('firms')
        .update({
          firm_name: localSettings.name,
          logo_url: localSettings.logo,
          brand_color: localSettings.color,
          slug: firmSlug,
          portal_message: localSettings.portalMessage || null,
          updated_at: new Date().toISOString()
        })
        .eq('firm_id', firmId);

      if (error) throw error;

      alert(`Firm branding updated to ${localSettings.name}`);

      // Auto-sync branding to CRM for Pro firms (logo + brand color)
      if (isPro) {
        syncBrandingToCrm(localSettings.logo || null);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to save settings');
    }
  };

  const PlanFeature = ({ text }: { text: string }) => (
    <div className="flex items-start gap-2 group">
      <div className="mt-1 p-0.5 rounded-full bg-brand-light text-brand group-hover:bg-brand group-hover:text-white transition-colors">
        <Check size={10} strokeWidth={3} />
      </div>
      <span className="text-xs text-slate-600 font-medium leading-relaxed">{text}</span>
    </div>
  );

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* GHL Users Modal */}
      {showGHLModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`bg-white rounded-2xl shadow-xl w-full ${isExtension ? 'max-w-full mx-2' : 'max-w-3xl'} overflow-hidden flex flex-col max-h-[80vh]`}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shadow-lg">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">CRM Team Members</h3>
                  <p className="text-xs text-slate-500 font-medium">Grant your CRM staff access to FilersHub</p>
                </div>
              </div>
              <button
                onClick={() => { setShowGHLModal(false); setGhlError(''); }}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="p-0 overflow-y-auto flex-1">
              {isLoadingGHL ? (
                <div className="p-12 flex flex-col items-center justify-center space-y-4 text-slate-400">
                  <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-medium">Fetching team from CRM...</p>
                </div>
              ) : ghlError ? (
                <div className="p-12 text-center space-y-4">
                  <p className="text-sm text-red-500 font-medium">{ghlError}</p>
                  {(ghlError.toLowerCase().includes('token') && ghlError.toLowerCase().includes('expired')) || ghlError.toLowerCase().includes('reconnect') ? (
                    <>
                      <a
                        href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-auth/init?action=reconnect&firmId=${firmId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
                      >
                        Reconnect CRM
                      </a>
                      <p className="text-xs text-slate-400 mt-2">After reconnecting, close that tab and click Try Again below.</p>
                      <button onClick={fetchGHLUsers} className="text-xs font-bold text-brand hover:underline">Try Again</button>
                    </>
                  ) : (
                    <button onClick={fetchGHLUsers} className="text-xs font-bold text-brand hover:underline">Try Again</button>
                  )}
                </div>
              ) : ghlUsers.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className={`${isExtension ? 'px-3' : 'px-6'} py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider`}>Name</th>
                      {!isExtension && <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</th>}
                      <th className={`${isExtension ? 'px-3' : 'px-6'} py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider`}>CRM Role</th>
                      <th className={`${isExtension ? 'px-3' : 'px-6'} py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider`}>App Role</th>
                      <th className={`${isExtension ? 'px-3' : 'px-6'} py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right`}>Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ghlUsers.map(user => {
                      const status = grantStatus[user.id] || 'idle';
                      const hasAccess = user.hasAccess || status === 'granted';

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className={`${isExtension ? 'px-3' : 'px-6'} py-4`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200 shrink-0">
                                {(user.name?.[0] || user.firstName?.[0] || '?').toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-slate-700 truncate">{user.name || `${user.firstName} ${user.lastName}`}</span>
                            </div>
                          </td>
                          {!isExtension && <td className="px-6 py-4 text-sm text-slate-500">{user.email}</td>}
                          <td className={`${isExtension ? 'px-3' : 'px-6'} py-4 text-xs font-medium text-slate-400 capitalize`}>{user.role}</td>
                          <td className={`${isExtension ? 'px-3' : 'px-6'} py-4`}>
                            {hasAccess ? (
                              <span className="text-xs font-semibold text-slate-600">{user.appRole || selectedRoles[user.id] || 'Tax Pro'}</span>
                            ) : (
                              <select
                                value={selectedRoles[user.id] || 'Tax Pro'}
                                onChange={(e) => setSelectedRoles(prev => ({ ...prev, [user.id]: e.target.value }))}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-brand"
                              >
                                <option value="Tax Pro">Tax Pro</option>
                                <option value="Manager">Manager</option>
                              </select>
                            )}
                          </td>
                          <td className={`${isExtension ? 'px-3' : 'px-6'} py-4 text-right`}>
                            {hasAccess ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                <CheckCircle2 size={12} /> Active
                              </span>
                            ) : (
                              <button
                                onClick={() => grantAccess(user)}
                                disabled={status === 'granting'}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand/90 transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-70"
                              >
                                {status === 'granting' ? 'Granting...' : status === 'error' ? 'Retry' : 'Grant Access'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-slate-500">
                  <p className="text-sm font-medium">No team members found in this CRM location.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {ghlUsers.filter(u => u.hasAccess || grantStatus[u.id] === 'granted').length} of {ghlUsers.length} members have access
              </p>
              <button
                onClick={() => { setShowGHLModal(false); setGhlError(''); }}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firm Profile & Branding Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className={`${isExtension ? 'p-4' : 'p-6'} border-b border-slate-100 ${isExtension ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-light text-brand rounded-lg">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800`}>Firm Profile & Branding</h2>
              <p className="text-xs text-slate-500">Manage your firm identity and portal aesthetics.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-opacity-90 transition-colors shadow-sm ${isExtension ? 'w-full justify-center' : ''}`}
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>

        <div className={`${isExtension ? 'p-4 space-y-6' : 'p-8 space-y-10'}`}>
          <div className={`grid grid-cols-1 ${isExtension ? 'gap-6' : 'lg:grid-cols-2 gap-12'}`}>
            {/* Firm Identity */}
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Firm Name</label>
                <div className="relative group">
                  <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand transition-colors" />
                  <input
                    type="text"
                    value={localSettings.name}
                    onChange={(e) => setLocalSettings(p => ({ ...p, name: e.target.value }))}
                    placeholder="Enter your firm name"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Portal Access URL</label>
                <div className="relative group">
                  <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <div className="w-full pl-10 pr-20 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 flex items-center overflow-hidden">
                    <span className="truncate">{portalUrl}</span>
                  </div>
                  <button
                    onClick={async () => {
                      const url = `https://${portalUrl}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopiedPortalUrl(true);
                      } catch {
                        // Fallback for iframe/non-secure contexts
                        const textarea = document.createElement('textarea');
                        textarea.value = url;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        setCopiedPortalUrl(true);
                      }
                      setTimeout(() => setCopiedPortalUrl(false), 2000);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-brand text-white text-[10px] font-bold rounded-lg hover:bg-brand/90 transition-all"
                  >
                    {copiedPortalUrl ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Share this link with your clients so they can log in to the portal.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Portal Welcome Message</label>
                <textarea
                  value={localSettings.portalMessage}
                  onChange={(e) => setLocalSettings({ ...localSettings, portalMessage: e.target.value })}
                  placeholder="Welcome to our client portal. Please sign in to access your tax documents and returns."
                  rows={3}
                  maxLength={300}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{localSettings.portalMessage.length}/300 — This message appears on your client portal login page.</p>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Firm Logo</label>
              <div className="flex items-center gap-6">
                <div className="w-28 h-28 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden group hover:border-brand/40 transition-colors">
                  <img
                    src={localSettings.logo}
                    alt="Firm Logo"
                    className="w-20 h-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors pointer-events-none">
                      <Upload size={14} />
                      {isUploadingLogo ? "Uploading..." : "Upload New Image"}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 max-w-[180px]">Transparent PNG recommended.</p>
                </div>
              </div>

              {/* Pro CRM Branding Sync Indicator */}
              {isPro ? (
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-indigo-500" />
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    Pro: Branding syncs to CRM
                  </span>
                  {logoSyncStatus === 'syncing' && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </div>
                  )}
                  {logoSyncStatus === 'success' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                      <CheckCircle2 size={12} /> {logoSyncMessage}
                    </span>
                  )}
                  {logoSyncStatus === 'error' && (
                    <span className="text-[10px] font-medium text-rose-500">
                      {logoSyncMessage}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-60">
                  <Sparkles size={12} className="text-slate-400" />
                  <span className="text-[10px] font-medium text-slate-400 italic">
                    Upgrade to Pro to sync branding to your CRM
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Color Palette */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
              <Palette size={16} className="text-brand" />
              Brand Primary Color
            </h3>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="flex flex-wrap gap-3">
                {colors.map(color => (
                  <button
                    key={color}
                    onClick={() => setLocalSettings(p => ({ ...p, color }))}
                    className={`w-11 h-11 rounded-xl border-4 transition-all hover:scale-110 ${localSettings.color.toLowerCase() === color.toLowerCase() ? 'border-slate-800 shadow-md' : 'border-transparent'
                      }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                <div className="h-10 w-[1px] bg-slate-200 hidden md:block"></div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom Hex Code</label>
                  <div className="relative group">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand" />
                    <input
                      type="text"
                      value={localSettings.color}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (!val.startsWith('#')) val = '#' + val;
                        setLocalSettings(p => ({ ...p, color: val }));
                      }}
                      className="pl-9 pr-4 py-2 w-32 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-brand outline-none uppercase"
                    />
                  </div>
                </div>
                <div
                  className="w-10 h-10 rounded-lg shadow-inner border border-slate-100"
                  style={{ backgroundColor: localSettings.color }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Staff Management Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className={`${isExtension ? 'p-4' : 'p-6'} border-b border-slate-100 ${isExtension ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users size={20} />
            </div>
            <div>
              <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800 flex items-center gap-3 flex-wrap`}>
                Team & Permissions
                <span className={`${isExtension ? 'text-xs' : 'text-sm'} font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg`}>
                  {assignedStaff} / {staffLimit} Staff Seats
                </span>
              </h2>
              <p className="text-xs text-slate-500">Manage your staff accounts and app access levels.</p>
            </div>
          </div>
          <button
            onClick={fetchGHLUsers}
            className={`flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand/90 transition-colors shadow-sm ${isExtension ? 'w-full justify-center' : ''}`}
          >
            <Users size={16} />
            Manage CRM Staff
          </button>
        </div>

        <div className={isExtension ? 'overflow-hidden' : 'overflow-x-auto'}>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Member</th>
                {!isExtension && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>}
                <th className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'} text-xs font-bold text-slate-500 uppercase tracking-wider`}>Role</th>
                {!isExtension && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffLoading ? (
                <tr>
                  <td colSpan={isExtension ? 2 : 4} className="px-6 py-8 text-center text-sm text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                      Loading staff...
                    </div>
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={isExtension ? 2 : 4} className="px-6 py-8 text-center text-sm text-slate-400">
                    No staff members found.
                  </td>
                </tr>
              ) : staff.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className={`${isExtension ? 'w-6 h-6' : 'w-8 h-8'} rounded-full border border-slate-200 group-hover:border-brand/40 transition-colors shrink-0 object-cover`} />
                      ) : (
                        <div className={`${isExtension ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-full bg-slate-100 border border-slate-200 group-hover:border-brand/40 transition-colors shrink-0 flex items-center justify-center font-bold text-slate-400`}>?</div>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-700 truncate block">{member.name}</span>
                        {member.role === UserRole.FirmOwner && (
                          <span className="text-[10px] font-bold text-amber-600">Owner</span>
                        )}
                      </div>
                    </div>
                  </td>
                  {!isExtension && (
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500">{member.email}</span>
                    </td>
                  )}
                  <td className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'}`}>
                    <div className="flex items-center gap-1">
                      <Shield size={14} className="text-brand shrink-0" />
                      {member.role === UserRole.FirmOwner ? (
                        <span className="text-sm font-medium text-slate-700">Firm Owner</span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) => {
                            if (e.target.value === '__revoke__') {
                              revokeAccess(member.id);
                            } else {
                              handleRoleChange(member.id, e.target.value as UserRole);
                            }
                          }}
                          className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer focus:text-brand"
                        >
                          <option value={UserRole.Manager}>Manager</option>
                          <option value={UserRole.TaxPro}>Tax Pro</option>
                          {isExtension && <option value="__revoke__" className="text-rose-500">Revoke Access</option>}
                        </select>
                      )}
                    </div>
                  </td>
                  {!isExtension && (
                    <td className="px-6 py-4 text-right">
                      {member.role !== UserRole.FirmOwner && (
                        <button
                          onClick={() => revokeAccess(member.id)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-700 hover:underline transition-all"
                        >
                          Revoke Access
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Firm Plan Area */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Firm Plan</h2>
              <p className="text-xs text-slate-500">Overview of FilersHub billing tiers and capabilities.</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Core Plan */}
            <div className="relative p-6 rounded-2xl border-2 border-slate-100 bg-slate-50/30 flex flex-col group hover:border-brand/20 transition-all">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-brand text-white text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 size={12} /> Active Plan
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  Firm Core
                  <Zap size={18} className="text-amber-500" />
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">For solo pros and small teams who want power without chaos.</p>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">User Limits</h4>
                  <ul className="space-y-2">
                    <PlanFeature text="1 Firm Owner" />
                    <PlanFeature text={`Up to ${staffLimit} staff users (${assignedStaff}/${staffLimit} used)`} />
                    <PlanFeature text="Unlimited clients" />
                  </ul>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Core Features</h4>
                  <div className="grid grid-cols-1 gap-y-2">
                    <PlanFeature text="Multi-tenant firm setup" />
                    <PlanFeature text="Firm branded client portal" />
                    <PlanFeature text="Secure document uploads" />
                    <PlanFeature text="Missing document tracking" />
                    <PlanFeature text="Tax return pipeline stages" />
                    <PlanFeature text="Activity log per client" />
                    <PlanFeature text="Role-based access control" />
                    <PlanFeature text="Firebase Storage folders" />
                    <PlanFeature text="Basic reporting (Open cases)" />
                    <PlanFeature text="Standard support" />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Who this is for</h4>
                  <p className="text-xs font-semibold text-slate-600 bg-white p-3 rounded-lg border border-slate-100 italic">
                    "Solo EAs and CPAs, Small firms, and first-time CRM users."
                  </p>
                </div>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="relative p-6 rounded-2xl border-2 border-indigo-100 bg-indigo-50/10 flex flex-col group hover:border-indigo-400 transition-all overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity -mr-4 -mt-4">
                <Sparkles size={120} className="text-indigo-600" />
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-black text-indigo-900 flex items-center gap-2">
                  Firm Pro
                  <Sparkles size={18} className="text-indigo-500" />
                </h3>
                <p className="text-xs text-indigo-600 font-medium mt-1">For growth mode firms that need control, visibility, and scale.</p>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">User Limits</h4>
                  <ul className="space-y-2">
                    <PlanFeature text="1 Firm Owner" />
                    <PlanFeature text="Up to 20 staff users" />
                    <PlanFeature text="Unlimited clients" />
                  </ul>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3 italic">Everything in Core, plus:</h4>
                  <div className="grid grid-cols-1 gap-y-2">
                    <PlanFeature text="Advanced role permissions" />
                    <PlanFeature text="Staff workload visibility" />
                    <PlanFeature text="Internal only statuses (On Hold, Review)" />
                    <PlanFeature text="Case reassignment history" />
                    <PlanFeature text="Staff activity tracking" />
                    <PlanFeature text="Bulk document requests" />
                    <PlanFeature text="Advanced reporting & Bottlenecks" />
                    <PlanFeature text="Priority file handling flags" />
                    <PlanFeature text="Custom internal notes per case" />
                    <PlanFeature text="Branded email notifications" />
                    <PlanFeature text="Priority support queue" />
                  </div>
                </div>

                <div className="pt-4 border-t border-indigo-100">
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Who this is for</h4>
                  <p className="text-xs font-semibold text-indigo-900 bg-white p-3 rounded-lg border border-indigo-100 italic">
                    "Established tax firms, multi-preparer offices, and firms wanting visibility."
                  </p>
                </div>
              </div>

              <button className="mt-8 w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2">
                <Zap size={16} />
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;