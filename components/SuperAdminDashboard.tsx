import React, { useMemo, useState } from 'react';
import {
  Building2,
  Users,
  ShieldCheck,
  Calendar,
  Search,
  Filter,
  MoreVertical,
  Zap,
  CheckCircle,
  TrendingUp,
  Mail,
  ExternalLink,
  Shield,
  LogOut
} from 'lucide-react';
import { Firm } from '../types';
import { useAuth } from '../contexts/AuthContext';

const mockFirms: Firm[] = [
  {
    id: 'f1',
    name: 'Alpha Tax Partners',
    ownerName: 'Sarah Johnson',
    ownerEmail: 'sarah@alphatax.com',
    tier: 'Pro',
    staffCount: 12,
    installDate: 'Oct 12, 2023',
    status: 'Active',
    ghlIntegrated: true
  },
  {
    id: 'f2',
    name: 'Main Street CPAs',
    ownerName: 'Robert California',
    ownerEmail: 'robert@mainstreet.com',
    tier: 'Core',
    staffCount: 3,
    installDate: 'Jan 05, 2024',
    status: 'Active',
    ghlIntegrated: false
  },
  {
    id: 'f3',
    name: 'Dunder Mifflin Financial',
    ownerName: 'Stanley Hudson',
    ownerEmail: 'stanley@dundermifflin.com',
    tier: 'Pro',
    staffCount: 8,
    installDate: 'Mar 15, 2024',
    status: 'Active',
    ghlIntegrated: true
  },
  {
    id: 'f4',
    name: 'Blue Ridge Tax Experts',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@blueridge.com',
    tier: 'Core',
    staffCount: 2,
    installDate: 'May 20, 2024',
    status: 'Active',
    ghlIntegrated: false
  }
];

const SuperAdminDashboard: React.FC = () => {
  const { signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | 'Core' | 'Pro'>('All');
  const logoUrl = "https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png";

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/'; // Force redirect to home/login
  };

  const filteredFirms = useMemo(() => {
    return mockFirms.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTier = tierFilter === 'All' || f.tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [searchQuery, tierFilter]);

  const stats = useMemo(() => {
    return {
      total: mockFirms.length,
      proFirms: mockFirms.filter(f => f.tier === 'Pro').length,
      totalStaff: mockFirms.reduce((acc, f) => acc + f.staffCount, 0),
      newThisMonth: 1 // Example
    };
  }, []);

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
            <h3 className="text-2xl font-black text-slate-800">{stats.total}</h3>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pro Tier Firms</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{stats.proFirms}</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Zap size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Platform Staff</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">{stats.totalStaff}</h3>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">New Firms (30d)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">+{stats.newThisMonth}</h3>
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
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tier & Scale</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Install Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">CRM Sync?</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFirms.map(firm => (
                <tr key={firm.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                        {firm.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{firm.name}</p>
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">{firm.status}</span>
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
                    <div className="flex items-center gap-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border ${firm.tier === 'Pro' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                        {firm.tier}
                      </span>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Users size={14} />
                        <span className="text-xs font-bold">{firm.staffCount} Staff</span>
                      </div>
                    </div>
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
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="View Firm Dashboard">
                        <ExternalLink size={18} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-slate-600">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Platform Infrastructure Monitoring v1.0</p>
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