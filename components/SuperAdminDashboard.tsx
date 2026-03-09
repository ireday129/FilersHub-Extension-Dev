import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  Calendar,
  Search,
  Mail,
  LogOut,
  Loader2,
  Save,
  X,
  Minus,
  Plus,
  Megaphone,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  PlusCircle,
  CreditCard,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Link2,
  Unlink,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import { Firm } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { FILERSHUB_LOGO_URL } from '../constants';
import SuperAdminTickets from './SuperAdminTickets';

const SuperAdminDashboard: React.FC = () => {
  const { signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | 'Core' | 'Pro' | 'IRS Alerts'>('All');
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSeats, setEditingSeats] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(10);
  const [saving, setSaving] = useState(false);
  const logoUrl = FILERSHUB_LOGO_URL;

  // Platform Updates state
  interface PlatformUpdate {
    update_id: string;
    type: 'update' | 'deadline';
    title: string;
    body: string;
    is_active: boolean;
    created_at: string;
  }
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [newUpdate, setNewUpdate] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({ type: 'update' as 'update' | 'deadline', title: '', body: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);

  // Support Tickets state
  const [openTicketCount, setOpenTicketCount] = useState<number>(0);

  // Subscriptions state
  interface SubscriptionRow {
    subscription_id: string;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    plan_tier: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at: string | null;
    created_at: string;
    firmName: string;
    ownerEmail: string;
  }
  interface PendingSubRow {
    id: string;
    stripe_subscription_id: string;
    customer_email: string;
    plan_tier: string;
    status: string;
    created_at: string;
  }
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [pendingSubs, setPendingSubs] = useState<PendingSubRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subStatusFilter, setSubStatusFilter] = useState<string>('All');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; pending: number; skipped: number; error?: string } | null>(null);
  const [linkingPendingId, setLinkingPendingId] = useState<string | null>(null);
  const [linkingFirmId, setLinkingFirmId] = useState<string>('');
  const [linkingInProgress, setLinkingInProgress] = useState(false);

  // Map DB tier values to display tier
  const normalizeTier = (dbTier: string): 'Core' | 'Pro' | 'IRS Alerts' => {
    const t = dbTier?.toLowerCase();
    if (t === 'pro') return 'Pro';
    if (t === 'irs alerts') return 'IRS Alerts';
    return 'Core';
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  // Fetch all firms with their staff counts and owner info
  useEffect(() => {
    const fetchFirms = async () => {
      setLoading(true);
      try {
        // Fetch firms with staff relationships in one query
        const { data: firmsData, error: firmsError } = await supabase
          .from('firms')
          .select('firm_id, firm_name, logo_url, slug, subscription_tier, subscription_status, max_staff, ghl_location_id, created_at, irs_alerts_enabled, stripe_subscription_id')
          .order('created_at', { ascending: false });

        if (firmsError) throw firmsError;

        // Fetch all staff and clients in bulk for efficiency
        const firmIds = (firmsData || []).map((f: any) => f.firm_id);

        // Get all active staff across all firms
        const { data: allStaff } = await supabase
          .from('staff')
          .select('firm_id, full_name, email, role, is_active')
          .in('firm_id', firmIds);

        // Get all active clients across all firms
        const { data: allClients } = await supabase
          .from('clients')
          .select('firm_id, is_active')
          .in('firm_id', firmIds);

        const firmsList: Firm[] = (firmsData || []).map((f: any) => {
          const firmStaff = (allStaff || []).filter((s: any) => s.firm_id === f.firm_id && s.is_active);
          const firmClients = (allClients || []).filter((c: any) => c.firm_id === f.firm_id && c.is_active);
          const owner = firmStaff.find((s: any) => s.role === 'Firm Owner');

          return {
            id: f.firm_id,
            name: f.firm_name || 'Unnamed Firm',
            logoUrl: f.logo_url || '',
            ownerName: owner?.full_name || '—',
            ownerEmail: owner?.email || '—',
            subscriptionTier: normalizeTier(f.subscription_tier),
            subscriptionStatus: f.subscription_status || 'active',
            staffCount: firmStaff.length,
            maxStaff: f.max_staff || 10,
            clientCount: firmClients.length,
            installDate: f.created_at ? new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
            ghlIntegrated: !!f.ghl_location_id,
            slug: f.slug || '',
            irsAlertsEnabled: !!f.irs_alerts_enabled,
            stripeSubscriptionId: f.stripe_subscription_id || null,
          };
        });

        setFirms(firmsList);
      } catch (err) {
        console.error('Error fetching firms:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFirms();
  }, []);

  // Save max_staff update
  const handleSaveSeats = async (firmId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('firms')
        .update({ max_staff: editValue })
        .eq('firm_id', firmId);

      if (error) throw error;

      setFirms(prev => prev.map(f =>
        f.id === firmId ? { ...f, maxStaff: editValue } : f
      ));
      setEditingSeats(null);
    } catch (err) {
      console.error('Error updating staff seats:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTier = async (firmId: string, currentTier: string) => {
    const newTier = currentTier === 'Pro' ? 'Core' : 'Pro';
    try {
      const { error } = await supabase
        .from('firms')
        .update({ subscription_tier: newTier, updated_at: new Date().toISOString() })
        .eq('firm_id', firmId);

      if (error) throw error;

      setFirms(prev => prev.map(f =>
        f.id === firmId ? { ...f, subscriptionTier: newTier as 'Core' | 'Pro' | 'IRS Alerts' } : f
      ));
    } catch (err) {
      console.error('Error toggling tier:', err);
    }
  };

  const handleToggleIrsAlerts = async (firmId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('firms')
        .update({ irs_alerts_enabled: !currentStatus })
        .eq('firm_id', firmId);

      if (error) throw error;

      setFirms(prev => prev.map(f =>
        f.id === firmId ? { ...f, irsAlertsEnabled: !currentStatus } : f
      ));
    } catch (err) {
      console.error('Error toggling IRS Alerts:', err);
    }
  };

  const handleOverrideAccess = async (firmId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'trialing' : 'active';
    try {
      const { error } = await supabase
        .from('firms')
        .update({ subscription_status: newStatus, updated_at: new Date().toISOString() })
        .eq('firm_id', firmId);

      if (error) throw error;

      setFirms(prev => prev.map(f =>
        f.id === firmId ? { ...f, subscriptionStatus: newStatus } : f
      ));
    } catch (err) {
      console.error('Error overriding access:', err);
    }
  };

  const unlinkedFirms = useMemo(() => {
    return firms.filter(f => !f.stripeSubscriptionId);
  }, [firms]);

  const handleLinkPendingToFirm = async (pendingEmail: string, firmId: string) => {
    if (!firmId) return;
    setLinkingInProgress(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-auth', {
        body: { action: 'claim-subscription', email: pendingEmail, firmId }
      });

      if (error) {
        console.error('Link error:', error);
        return;
      }

      if (data?.linked) {
        // Remove from pending list and refresh firms
        setPendingSubs(prev => prev.filter(ps => ps.customer_email !== pendingEmail));
        setLinkingPendingId(null);
        setLinkingFirmId('');
        // Reload to refresh all data
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (err) {
      console.error('Link error:', err);
    } finally {
      setLinkingInProgress(false);
    }
  };

  const handleStripeSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-sync');

      if (error) {
        console.error('Stripe sync error:', error);
        setSyncResult({ synced: 0, pending: 0, skipped: 0, error: error.message || JSON.stringify(error) });
        return;
      }

      if (data?.error) {
        console.error('Stripe sync function error:', data.error);
        setSyncResult({ synced: 0, pending: 0, skipped: 0, error: data.error });
        return;
      }

      setSyncResult({ synced: data.synced ?? 0, pending: data.pending ?? 0, skipped: data.skipped ?? 0 });

      // Reload after a short delay so user can see the result
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      console.error('Stripe sync error:', err);
      setSyncResult({ synced: 0, pending: 0, skipped: 0, error: err?.message || 'Unknown error' });
    } finally {
      setSyncing(false);
    }
  };

  // Fetch platform updates
  useEffect(() => {
    const fetchUpdates = async () => {
      setUpdatesLoading(true);
      try {
        const { data, error } = await supabase
          .from('platform_updates')
          .select('update_id, type, title, body, is_active, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setUpdates(data || []);
      } catch (err) {
        console.error('Error fetching platform updates:', err);
      } finally {
        setUpdatesLoading(false);
      }
    };

    fetchUpdates();
  }, []);

  // Fetch subscriptions
  useEffect(() => {
    const fetchSubscriptions = async () => {
      setSubsLoading(true);
      try {
        const { data: subsData } = await supabase
          .from('subscriptions')
          .select('subscription_id, stripe_subscription_id, stripe_customer_id, plan_tier, status, current_period_start, current_period_end, cancel_at, created_at, firm_id')
          .order('created_at', { ascending: false });

        if (subsData && subsData.length > 0) {
          const firmIds = subsData.map((s: any) => s.firm_id);

          const { data: firmNames } = await supabase
            .from('firms')
            .select('firm_id, firm_name')
            .in('firm_id', firmIds);

          const { data: owners } = await supabase
            .from('staff')
            .select('firm_id, email')
            .in('firm_id', firmIds)
            .eq('role', 'Firm Owner');

          const nameMap = new Map((firmNames || []).map((f: any) => [f.firm_id, f.firm_name]));
          const ownerMap = new Map((owners || []).map((o: any) => [o.firm_id, o.email]));

          setSubscriptions(subsData.map((s: any) => ({
            ...s,
            firmName: nameMap.get(s.firm_id) || '—',
            ownerEmail: ownerMap.get(s.firm_id) || '—'
          })));
        }

        const { data: pendingData } = await supabase
          .from('pending_subscriptions')
          .select('id, stripe_subscription_id, customer_email, plan_tier, status, created_at')
          .is('linked_firm_id', null)
          .order('created_at', { ascending: false });

        setPendingSubs(pendingData || []);
      } catch (err) {
        console.error('Error fetching subscriptions:', err);
      } finally {
        setSubsLoading(false);
      }
    };

    fetchSubscriptions();
  }, []);

  const subStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-600 bg-emerald-50';
      case 'trialing': return 'text-blue-600 bg-blue-50';
      case 'past_due': return 'text-amber-600 bg-amber-50';
      case 'canceled': return 'text-rose-600 bg-rose-50';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  const filteredSubs = useMemo(() => {
    if (subStatusFilter === 'All') return subscriptions;
    return subscriptions.filter(s => s.status === subStatusFilter);
  }, [subscriptions, subStatusFilter]);

  const subStats = useMemo(() => ({
    active: subscriptions.filter(s => s.status === 'active').length,
    pastDue: subscriptions.filter(s => s.status === 'past_due').length,
    pending: pendingSubs.length,
  }), [subscriptions, pendingSubs]);

  const handleCreateUpdate = async () => {
    if (!updateForm.title.trim() || !updateForm.body.trim()) return;
    setSavingUpdate(true);
    try {
      const { data, error } = await supabase
        .from('platform_updates')
        .insert({ type: updateForm.type, title: updateForm.title.trim(), body: updateForm.body.trim() })
        .select()
        .single();

      if (error) throw error;
      setUpdates(prev => [data, ...prev]);
      setNewUpdate(false);
      setUpdateForm({ type: 'update', title: '', body: '' });
    } catch (err) {
      console.error('Error creating update:', err);
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleSaveUpdate = async (updateId: string) => {
    if (!updateForm.title.trim() || !updateForm.body.trim()) return;
    setSavingUpdate(true);
    try {
      const { error } = await supabase
        .from('platform_updates')
        .update({ type: updateForm.type, title: updateForm.title.trim(), body: updateForm.body.trim(), updated_at: new Date().toISOString() })
        .eq('update_id', updateId);

      if (error) throw error;
      setUpdates(prev => prev.map(u =>
        u.update_id === updateId ? { ...u, type: updateForm.type, title: updateForm.title.trim(), body: updateForm.body.trim() } : u
      ));
      setEditingUpdate(null);
      setUpdateForm({ type: 'update', title: '', body: '' });
    } catch (err) {
      console.error('Error updating update:', err);
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleToggleActive = async (updateId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('platform_updates')
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
        .eq('update_id', updateId);

      if (error) throw error;
      setUpdates(prev => prev.map(u =>
        u.update_id === updateId ? { ...u, is_active: !currentActive } : u
      ));
    } catch (err) {
      console.error('Error toggling update:', err);
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      const { error } = await supabase
        .from('platform_updates')
        .delete()
        .eq('update_id', updateId);

      if (error) throw error;
      setUpdates(prev => prev.filter(u => u.update_id !== updateId));
    } catch (err) {
      console.error('Error deleting update:', err);
    }
  };

  const filteredFirms = useMemo(() => {
    return firms.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTier = tierFilter === 'All' || f.subscriptionTier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [firms, searchQuery, tierFilter]);

  const stats = useMemo(() => {
    return {
      total: firms.length,
      proFirms: firms.filter(f => f.subscriptionTier === 'Pro').length,
      totalStaff: firms.reduce((acc, f) => acc + f.staffCount, 0),
      totalClients: firms.reduce((acc, f) => acc + f.clientCount, 0),
    };
  }, [firms]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col items-center justify-center mb-8 relative">
        <div className="absolute right-0 top-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
        <img src={logoUrl} alt="FilersHub" className="h-12 w-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900">Platform Administration</h1>
        <p className="text-slate-500 text-sm">Manage firms, monitor installations, and track growth.</p>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Firms</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{loading ? '—' : stats.total}</h3>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Subs</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{subsLoading ? '—' : subStats.active}</h3>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Past Due</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{subsLoading ? '—' : subStats.pastDue}</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pending Link</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{subsLoading ? '—' : subStats.pending}</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Open Tickets</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{openTicketCount}</h3>
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <MessageCircle size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Platform Updates Management */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <Megaphone size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Important Updates</h2>
              <p className="text-xs text-slate-400">Manage announcements visible in the GHL widget</p>
            </div>
          </div>
          {!newUpdate && (
            <button
              onClick={() => { setNewUpdate(true); setEditingUpdate(null); setUpdateForm({ type: 'update', title: '', body: '' }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
            >
              <PlusCircle size={14} />
              New Update
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {/* New Update Form */}
          {newUpdate && (
            <div className="p-4 bg-violet-50/50">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <select
                    value={updateForm.type}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, type: e.target.value as 'update' | 'deadline' }))}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="update">Update</option>
                    <option value="deadline">Deadline</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Title"
                    value={updateForm.title}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, title: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <textarea
                  placeholder="Body text..."
                  value={updateForm.body}
                  onChange={(e) => setUpdateForm(prev => ({ ...prev, body: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setNewUpdate(false); setUpdateForm({ type: 'update', title: '', body: '' }); }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateUpdate}
                    disabled={savingUpdate || !updateForm.title.trim() || !updateForm.body.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {savingUpdate ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Publish
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Updates List */}
          {updatesLoading ? (
            <div className="px-6 py-12 text-center">
              <Loader2 size={20} className="animate-spin text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading updates...</p>
            </div>
          ) : updates.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Megaphone size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No updates yet. Create your first one above.</p>
            </div>
          ) : updates.map(u => (
            <div key={u.update_id} className={`p-4 ${!u.is_active ? 'opacity-50' : ''}`}>
              {editingUpdate === u.update_id ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <select
                      value={updateForm.type}
                      onChange={(e) => setUpdateForm(prev => ({ ...prev, type: e.target.value as 'update' | 'deadline' }))}
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="update">Update</option>
                      <option value="deadline">Deadline</option>
                    </select>
                    <input
                      type="text"
                      value={updateForm.title}
                      onChange={(e) => setUpdateForm(prev => ({ ...prev, title: e.target.value }))}
                      className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <textarea
                    value={updateForm.body}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, body: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setEditingUpdate(null); setUpdateForm({ type: 'update', title: '', body: '' }); }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveUpdate(u.update_id)}
                      disabled={savingUpdate || !updateForm.title.trim() || !updateForm.body.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {savingUpdate ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 text-[10px] font-black uppercase rounded ${u.type === 'deadline' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                        {u.type}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{u.title}</span>
                      {!u.is_active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-slate-100 text-slate-400">Hidden</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{u.body}</p>
                    <p className="text-[10px] text-slate-300 mt-1">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(u.update_id, u.is_active)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                      title={u.is_active ? 'Hide from widget' : 'Show on widget'}
                    >
                      {u.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => { setEditingUpdate(u.update_id); setNewUpdate(false); setUpdateForm({ type: u.type, title: u.title, body: u.body }); }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteUpdate(u.update_id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Support Tickets */}
      <SuperAdminTickets onOpenCountChange={setOpenTicketCount} />

      {/* Subscriptions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Subscriptions</h2>
              <p className="text-xs text-slate-400">Stripe subscription status for all firms</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleStripeSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Stripe'}
            </button>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {['All', 'active', 'past_due', 'canceled', 'trialing'].map(s => (
                <button
                  key={s}
                  onClick={() => setSubStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${subStatusFilter === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                >
                  {s === 'All' ? 'All' : s === 'past_due' ? 'Past Due' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {syncResult && (
          <div className={`px-6 py-3 border-b border-slate-100 ${syncResult.error ? 'bg-rose-50' : 'bg-emerald-50'}`}>
            {syncResult.error ? (
              <p className="text-xs font-bold text-rose-600">Sync failed: {syncResult.error}</p>
            ) : (
              <p className="text-xs font-bold text-emerald-700">
                Sync complete: {syncResult.synced} linked to firms, {syncResult.pending} stored as pending, {syncResult.skipped} skipped
              </p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Firm</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Owner Email</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tier</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Period End</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Stripe ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subsLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Loader2 size={24} className="animate-spin text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Loading subscriptions...</p>
                  </td>
                </tr>
              ) : filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <CreditCard size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No subscriptions found.</p>
                  </td>
                </tr>
              ) : filteredSubs.map(sub => (
                <tr key={sub.subscription_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-800">{sub.firmName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Mail size={12} />
                      <span className="text-xs">{sub.ownerEmail}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border ${
                      sub.plan_tier === 'Pro'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {sub.plan_tier}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${subStatusColor(sub.status)}`}>
                      {sub.status === 'past_due' ? 'Past Due' : sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-500">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-mono text-slate-400">
                      {sub.stripe_subscription_id
                        ? `${sub.stripe_subscription_id.slice(0, 20)}...`
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending (unlinked) subscriptions */}
        {pendingSubs.length > 0 && (
          <div className="border-t border-slate-200">
            <div className="px-6 py-3 bg-amber-50/50 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-amber-600" />
                <p className="text-xs font-bold text-amber-700">Pending — Paid but not yet installed ({pendingSubs.length})</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingSubs.map(ps => (
                <div key={ps.id} className="px-6 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Mail size={12} />
                      <span className="text-xs font-medium">{ps.customer_email}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter border ${
                      ps.plan_tier === 'Pro'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {ps.plan_tier}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${subStatusColor(ps.status)}`}>
                      {ps.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {linkingPendingId === ps.id ? (
                      <>
                        <select
                          value={linkingFirmId}
                          onChange={(e) => setLinkingFirmId(e.target.value)}
                          className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
                        >
                          <option value="">Select a firm...</option>
                          {unlinkedFirms.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleLinkPendingToFirm(ps.customer_email, linkingFirmId)}
                          disabled={!linkingFirmId || linkingInProgress}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          {linkingInProgress ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                          Link
                        </button>
                        <button
                          onClick={() => { setLinkingPendingId(null); setLinkingFirmId(''); }}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] text-slate-400">
                          {new Date(ps.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <button
                          onClick={() => { setLinkingPendingId(ps.id); setLinkingFirmId(''); }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Link2 size={12} />
                          Link to Firm
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {subsLoading ? 'Loading...' : `${filteredSubs.length} subscription${filteredSubs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Firms Management Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search firms or owners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['All', 'Core', 'Pro', 'IRS Alerts'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tierFilter === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Firm Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Owner Info</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tier</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Stripe</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Access</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Seats</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Clients</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Install Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">IRS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <Loader2 size={24} className="animate-spin text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Loading firms...</p>
                  </td>
                </tr>
              ) : filteredFirms.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <Building2 size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No firms found.</p>
                  </td>
                </tr>
              ) : filteredFirms.map(firm => (
                <tr key={firm.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {firm.logoUrl ? (
                        <img src={firm.logoUrl} alt={firm.name} className="w-10 h-10 rounded-xl object-contain bg-white border border-slate-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                          {firm.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-800">{firm.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-slate-700">{firm.ownerName}</p>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Mail size={12} />
                        <span className="text-xs">{firm.ownerEmail}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleTier(firm.id, firm.subscriptionTier)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border cursor-pointer transition-colors ${firm.subscriptionTier === 'Pro'
                        ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                      title={`Click to switch to ${firm.subscriptionTier === 'Pro' ? 'Core' : 'Pro'}`}
                    >
                      {firm.subscriptionTier}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {firm.stripeSubscriptionId ? (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg" title={firm.stripeSubscriptionId}>
                        <Link2 size={12} />
                        <span className="text-[10px] font-bold">Connected</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-400 rounded-lg">
                        <Unlink size={12} />
                        <span className="text-[10px] font-bold">None</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {firm.stripeSubscriptionId ? (
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${subStatusColor(firm.subscriptionStatus)}`}>
                        {firm.subscriptionStatus}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOverrideAccess(firm.id, firm.subscriptionStatus)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-colors ${
                          firm.subscriptionStatus === 'active'
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                        }`}
                        title={firm.subscriptionStatus === 'active' ? 'Click to revoke manual access' : 'Click to grant manual access'}
                      >
                        <ShieldCheck size={12} />
                        {firm.subscriptionStatus === 'active' ? 'Granted' : 'Grant Access'}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingSeats === firm.id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                          <button
                            onClick={() => setEditValue(Math.max(1, editValue - 1))}
                            className="p-1 text-slate-500 hover:text-slate-700 hover:bg-white rounded transition-all"
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 text-center text-sm font-bold bg-transparent outline-none"
                            min={1}
                          />
                          <button
                            onClick={() => setEditValue(editValue + 1)}
                            className="p-1 text-slate-500 hover:text-slate-700 hover:bg-white rounded transition-all"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          onClick={() => handleSaveSeats(firm.id)}
                          disabled={saving}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          title="Save"
                        >
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                        <button
                          onClick={() => setEditingSeats(null)}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-all"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingSeats(firm.id); setEditValue(firm.maxStaff); }}
                        className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors group/seats"
                        title="Click to edit staff seats"
                      >
                        <Users size={14} />
                        <span className="text-xs font-bold">
                          {firm.staffCount} / {firm.maxStaff}
                        </span>
                        <span className="text-[10px] text-slate-400 group-hover/seats:text-indigo-400">edit</span>
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-600">{firm.clientCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Calendar size={14} />
                      <span className="text-xs font-medium">{firm.installDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleIrsAlerts(firm.id, firm.irsAlertsEnabled || false)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 outline-none ${firm.irsAlertsEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${firm.irsAlertsEnabled ? 'translate-x-1.5' : '-translate-x-1.5'}`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {loading ? 'Loading...' : `${filteredFirms.length} firm${filteredFirms.length !== 1 ? 's' : ''}`}
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Systems Nominal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
