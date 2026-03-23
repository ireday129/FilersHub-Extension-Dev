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
  Sparkles,
  CheckCircle2,
  Landmark,
  AlertCircle,
  Lock
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
    irsAlertsEnabled?: boolean;
    queueCounterEnabled?: boolean;
    ghlAlertWebhookUrl?: string | null;
  };
  setFirmSettings: React.Dispatch<React.SetStateAction<{
    name: string;
    logo: string;
    color: string;
    slug?: string;
    portalMessage?: string;
    ghlAlertWebhookUrl?: string | null;
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

  // IRS Connection State
  const [irsConnection, setIrsConnection] = useState<any>(null);
  const [loadingIrs, setLoadingIrs] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchIrsStatus = async () => {
      setLoadingIrs(true);
      try {
        const { data } = await supabase
          .from('irs_connections')
          .select('consent_status, updated_at, token_expires_at, refresh_expires_at')
          .eq('user_id', user.id)
          .maybeSingle();
        setIrsConnection(data);
      } catch (err) {
        console.error('Error fetching IRS connection:', err);
      } finally {
        setLoadingIrs(false);
      }
    };
    fetchIrsStatus();
  }, [user]);

  const handleConnectIrs = () => {
    if (!user) return;
    const clientId = import.meta.env.VITE_IRS_CLIENT_ID || 'PENDING_IRS_CLIENT_ID';
    const redirectUri = import.meta.env.VITE_IRS_REDIRECT_URI 
      || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/irs-oauth`;
    const irsAuthorizeUrl = import.meta.env.VITE_IRS_AUTHORIZE_URL
      || 'https://api.alt.www4.irs.gov/auth/oauth/v2/authorize';
    const scope = import.meta.env.VITE_IRS_SCOPE || 'tds.read';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state: user.id,
    });

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(`${irsAuthorizeUrl}?${params.toString()}`, 'IRS Auth', `width=${width},height=${height},top=${top},left=${left}`);
  };

  const handleDisconnectIrs = async () => {
    if (!user) return;
    if (confirm('Are you sure you want to disconnect from IRS e-Services? This will stop transcript monitoring.')) {
      try {
        await supabase.from('irs_connections').delete().eq('user_id', user.id);
        setIrsConnection(null);
      } catch (err) {
        console.error('Error disconnecting IRS:', err);
      }
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'IRS_AUTH_SUCCESS') {
        alert('IRS e-Services account connected successfully!');
        window.location.reload();
      } else if (event.data?.type === 'IRS_AUTH_ERROR') {
        alert(`Failed to connect to IRS e-Services: ${event.data.payload}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
  const [subscriptionTier, setSubscriptionTier] = useState<string>('Core');
  const [logoSyncStatus, setLogoSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [logoSyncMessage, setLogoSyncMessage] = useState('');
  const isPro = subscriptionTier === 'Pro';

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
    setGrantStatus({});
    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: { action: 'list', firmId },
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
          firmId,
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
    const previousStaff = staff;
    setStaff(prev => prev.map(member =>
      member.id === id ? { ...member, role: newRole } : member
    ));
    try {
      const token = await getFreshToken();
      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: { action: 'update-role', firmId, staffId: id, role: newRole },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error updating role:', err);
      setStaff(previousStaff);
      alert('Failed to update role: ' + (err?.message || 'Unknown error'));
    }
  };

  const revokeAccess = async (staffId: string) => {
    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-users', {
        body: { action: 'revoke', firmId, staffId },
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


  const syncBrandingToCrm = async (logoUrl: string | null, brandColor: string | null) => {
    if (!firmId) return;
    if (!logoUrl && !brandColor) return;

    setLogoSyncStatus('syncing');
    setLogoSyncMessage('');

    try {
      const token = await getFreshToken();

      const { data, error } = await supabase.functions.invoke('crm-logo-sync', {
        body: { firmId, logoUrl, brandColor },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data?.error) throw new Error(data.error);
      if (error) {
        // FunctionsHttpError wraps the actual response in error.context
        const ctx = error?.context;
        if (ctx?.success) {
          // Function succeeded despite non-2xx wrapper — treat as success
        } else if (typeof ctx?.error === 'string') {
          throw new Error(ctx.error);
        } else {
          throw error;
        }
      }

      setLogoSyncStatus('success');
      setLogoSyncMessage('Synced to CRM Successfully');
      setTimeout(() => setLogoSyncStatus('idle'), 4000);
    } catch (err: any) {
      console.error('CRM branding sync failed:', err);
      setLogoSyncStatus('error');
      setLogoSyncMessage(err.message || 'Failed to sync branding to CRM');
      setTimeout(() => setLogoSyncStatus('idle'), 10000);
    }
  };

  const pinToGhlSidebar = async () => {
    if (!firmId) return;
    try {
      const token = await getFreshToken();
      const { data, error } = await supabase.functions.invoke('crm-sidebar-pin', {
        body: { firmId, action: 'pin' },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data?.error) console.error('Sidebar pin failed:', data.error);
      if (error) {
        const ctx = error?.context;
        if (!ctx?.success) console.error('Sidebar pin failed:', error.message);
      }
    } catch (err: any) {
      console.error('Sidebar pin failed:', err);
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
          ghl_alert_webhook_url: localSettings.ghlAlertWebhookUrl || null,
          updated_at: new Date().toISOString()
        })
        .eq('firm_id', firmId);

      if (error) throw error;

      alert(`Firm branding updated to ${localSettings.name}`);

      // Auto-sync branding to CRM (logo + brand color)
      syncBrandingToCrm(localSettings.logo || null, localSettings.color || null);

      // Auto-pin to GHL sidebar for Pro firms
      if (isPro) {
        pinToGhlSidebar();
      }
    } catch (error: any) {
      console.error('Error updating settings:', error);
      alert('Failed to save settings: ' + (error?.message || error));
    }
  };

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
                  <p className="text-[10px] text-slate-400 max-w-[200px]">Preferred size: 200x100px with a transparent background (PNG).</p>
                </div>
              </div>

              {/* CRM Branding Sync Indicator */}
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-indigo-500" />
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Branding Syncs to CRM for Pro Users
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
              ) : [...staff].sort((a, b) => {
                if (a.role === UserRole.FirmOwner) return -1;
                if (b.role === UserRole.FirmOwner) return 1;
                return 0;
              }).map((member) => (
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
                      {member.email?.toLowerCase() === user?.email?.toLowerCase() ? (
                        <span className="text-sm font-medium text-slate-700">{member.role}</span>
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
                      {member.email?.toLowerCase() !== user?.email?.toLowerCase() && (
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

      {/* IRS e-Services Connection Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
        <div className={`${isExtension ? 'p-4' : 'p-6'} border-b border-slate-100 ${isExtension ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${firmSettings.irsAlertsEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
              <Landmark size={20} />
            </div>
            <div>
              <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800 flex items-center gap-2 flex-wrap`}>
                IRS e-Services Connection
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${firmSettings.irsAlertsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  PREMIUM FEATURE
                </span>
                {!firmSettings.irsAlertsEnabled && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Connect your TDS account to enable automated tax transcript monitoring.</p>
            </div>
          </div>
        </div>

        <div className={`${isExtension ? 'p-4' : 'p-6 bg-slate-50/50'}`}>
          {!firmSettings.irsAlertsEnabled ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-50"></div>
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm">
                <Lock size={28} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Unlock IRS Transcript Monitoring</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                Automatically pull client transcripts and get notified via email or SMS when specific transaction codes appear. Upgrade your firm to the Pro tier to enable this feature.
              </p>
              <a
                href="mailto:support@filershub.com?subject=Upgrade to Pro Tier"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 transition-all shadow-sm active:scale-95"
              >
                <Sparkles size={16} /> Contact Support to Upgrade
              </a>
            </div>
          ) : loadingIrs ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              Checking connection status...
            </div>
          ) : irsConnection ? (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Connected to IRS e-Services</h3>
                    <p className="text-xs text-slate-500 mt-1">Status: <span className="font-semibold text-emerald-600 uppercase text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md">{irsConnection.consent_status}</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">Last synced: {new Date(irsConnection.updated_at).toLocaleString()}</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnectIrs}
                  className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold rounded-lg transition-colors border border-rose-100 shadow-sm"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <div className="flex items-start gap-3 mb-2">
                  <AlertCircle className="text-slate-400 shrink-0 mt-0.5" size={18} />
                  <h3 className="text-sm font-bold text-slate-800">Not Connected</h3>
                </div>
                <p className="text-xs text-slate-500 ml-7 leading-relaxed flex-wrap">
                  You must authorize FilersHub via the IRS Intermediate Service Provider (ISP) OAuth flow. This grants read-only access to Transcript Delivery System APIs for clients you monitor.
                </p>
              </div>
              <button
                onClick={handleConnectIrs}
                className="shrink-0 px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
              >
                Connect to IRS e-Services
              </button>
            </div>
          )}

          {/* CRM Webhook URL Configuration */}
          {firmSettings.irsAlertsEnabled && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-start gap-3 mb-3">
                <Globe className="text-slate-400 mt-1" size={18} />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">CRM Workflow Webhook (Optional)</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    Paste a CRM Inbound Webhook URL here. We will send a POST request with the transcript code data to this URL whenever an IRS Alert is triggered, allowing you to use CRM workflows to send email or SMS notifications.
                  </p>
                </div>
              </div>
              <div className="ml-7 flex max-w-3xl items-center gap-3">
                <input
                  type="url"
                  placeholder="https://services.leadconnectorhq.com/hooks/..."
                  value={localSettings.ghlAlertWebhookUrl || ''}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, ghlAlertWebhookUrl: e.target.value }))}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Client Queue Counter Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-[200ms]">
        <div className={`${isExtension ? 'p-4' : 'p-6'} border-b border-slate-100 ${isExtension ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${firmSettings.queueCounterEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
              <Hash size={20} />
            </div>
            <div>
              <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800 flex items-center gap-2 flex-wrap`}>
                Client Queue Counter
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${firmSettings.queueCounterEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                  PREMIUM FEATURE
                </span>
                {!firmSettings.queueCounterEnabled && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Show clients their real-time position in your processing queue.</p>
            </div>
          </div>
        </div>

        <div className={`${isExtension ? 'p-4' : 'p-6 bg-slate-50/50'}`}>
          {!firmSettings.queueCounterEnabled ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-50"></div>
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm">
                <Lock size={28} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Unlock Client Queue Counter</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                Elevate your client experience by taking the mystery out of tax prep. The Queue Counter gives clients peace of mind by showing exactly where their return is in line. Upgrade to Pro to enable this automated transparency tool.
              </p>
              <a
                href="mailto:support@filershub.com?subject=Upgrade to Pro Tier"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 transition-all shadow-sm active:scale-95"
              >
                <Sparkles size={16} /> Contact Support to Upgrade
              </a>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <div className="flex items-start gap-3 mb-2">
                  <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                  <h3 className="text-sm font-bold text-slate-800">Queue Counter Active</h3>
                </div>
                <p className="text-xs text-slate-500 ml-8 leading-relaxed flex-wrap">
                  Your clients can now see their real-time position in the processing queue when they log into the portal. The counter only displays when their status is set to Intake Received, Compliance Review, In Preparation, or Bank Product. 
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Upgrade to Pro */}
      {!isPro && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={`${isExtension ? 'p-4' : 'p-6'} flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800`}>Upgrade to Pro</h2>
                <p className="text-xs text-slate-500">
                  Email <a href="mailto:support@filershub.com?subject=Upgrade to Pro" className="text-indigo-600 font-semibold hover:underline">support@filershub.com</a> with the subject line <span className="font-semibold text-slate-700">"Upgrade to Pro"</span> to get started.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Settings;