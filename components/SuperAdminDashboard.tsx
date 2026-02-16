import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  Calendar,
  Search,
  CheckCircle,
  TrendingUp,
  Mail,
  LogOut,
  Loader2,
  Save,
  X,
  Minus,
  Plus,
  Zap
} from 'lucide-react';
import { Firm } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

const SuperAdminDashboard: React.FC = () => {
  const { signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | 'Core' | 'Pro'>('All');
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSeats, setEditingSeats] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(10);
  const [saving, setSaving] = useState(false);
  const logoUrl = "https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png";

  // Map DB tier values to display tier
  const normalizeTier = (dbTier: string): 'Core' | 'Pro' => {
    const t = dbTier?.toLowerCase();
    if (t === 'pro' || t === 'growth' || t === 'enterprise') return 'Pro';
    return 'Core'; // starter, core, or anything else defaults to Core
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
          .select('firm_id, firm_name, slug, subscription_tier, subscription_status, max_staff, ghl_location_id, created_at')
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pro Tier Firms</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{loading ? '—' : stats.proFirms}</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Zap size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Staff</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{loading ? '—' : stats.totalStaff}</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Clients</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{loading ? '—' : stats.totalClients}</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
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
              {(['All', 'Core', 'Pro'] as const).map(t => (
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
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Seats</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Clients</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Install Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">CRM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Loader2 size={24} className="animate-spin text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Loading firms...</p>
                  </td>
                </tr>
              ) : filteredFirms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Building2 size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No firms found.</p>
                  </td>
                </tr>
              ) : filteredFirms.map(firm => (
                <tr key={firm.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                        {firm.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{firm.name}</p>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                          firm.subscriptionStatus === 'active' ? 'text-emerald-600 bg-emerald-50' :
                          firm.subscriptionStatus === 'trialing' ? 'text-blue-600 bg-blue-50' :
                          'text-slate-500 bg-slate-100'
                        }`}>{firm.subscriptionStatus}</span>
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
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border ${
                      firm.subscriptionTier === 'Pro'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {firm.subscriptionTier}
                    </span>
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
                    {firm.ghlIntegrated ? (
                      <div className="inline-flex items-center justify-center w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full">
                        <CheckCircle size={14} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-300 rounded-full">
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                      </div>
                    )}
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
