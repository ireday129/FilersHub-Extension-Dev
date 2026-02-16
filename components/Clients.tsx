import React, { useState, useMemo } from 'react';
import { UserRole, TaxReturn, TaxReturnStatus, NavItem } from '../types';
import { useExtensionMode } from '../hooks/useExtensionMode';
import { supabase } from '../services/supabase';
import {
  Users,
  Search,
  ArrowRight,
  CheckCircle,
  Clock,
  Filter,
  UserCheck,
  LayoutGrid,
  List,
  Mail,
  MoreVertical,
  Plus,
  X,
  Loader2
} from 'lucide-react';

interface ClientsProps {
  role: UserRole;
  returns: TaxReturn[];
  setSelectedReturnId: (id: string | null) => void;
  setActiveTab: (tab: NavItem) => void;
  firmId: string | null;
  refreshData: () => Promise<void>;
}

type ClientView = 'My Clients' | 'Firm Clients';

const Clients: React.FC<ClientsProps> = ({ role, returns, setSelectedReturnId, setActiveTab, firmId, refreshData }) => {
  const { isExtension } = useExtensionMode();
  const [activeView, setActiveView] = useState<ClientView>('My Clients');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Client form state
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const canAddClients = role === UserRole.FirmOwner || role === UserRole.Manager;

  const handleAddClient = async () => {
    if (!newClientName.trim() || !newClientEmail.trim() || !firmId) return;
    setAddingClient(true);
    setAddError(null);
    setAddSuccess(false);

    try {
      const { error } = await supabase.from('clients').insert({
        firm_id: firmId,
        full_name: newClientName.trim(),
        email: newClientEmail.trim().toLowerCase(),
        tax_return_status: 'Intake Received',
        is_active: true,
      });

      if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
          setAddError('A client with this email already exists for your firm.');
        } else {
          throw error;
        }
        return;
      }

      setNewClientName('');
      setNewClientEmail('');
      setAddSuccess(true);
      setTimeout(() => {
        setShowAddClient(false);
        setAddSuccess(false);
      }, 1500);
      await refreshData();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add client.');
    } finally {
      setAddingClient(false);
    }
  };

  const staffName = useMemo(() => {
    if (role === UserRole.FirmOwner) return "Sarah Johnson";
    if (role === UserRole.Manager) return "Marcus Aurelius";
    if (role === UserRole.TaxPro) return "David Smith";
    return "";
  }, [role]);

  const filteredReturns = useMemo(() => {
    let base = [...returns];

    if (activeView === 'My Clients' || role === UserRole.TaxPro) {
      base = base.filter(r => r.preparer === staffName);
    }
    // 'Firm Clients' shows all, no filtering

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(r =>
        r.clientName.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }

    return base;
  }, [returns, activeView, staffName, role, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: filteredReturns.length,
      highPriority: filteredReturns.filter(r => r.status === TaxReturnStatus.MissingDocuments).length,
      filed: filteredReturns.filter(r => r.status === TaxReturnStatus.Filed).length,
    };
  }, [filteredReturns]);

  const handleManageReturn = (returnId: string) => {
    setSelectedReturnId(returnId);
    setActiveTab(NavItem.Dashboard);
  };

  const renderTabs = () => {
    if (role === UserRole.FirmOwner || role === UserRole.Manager) {
      const views: ClientView[] = ['My Clients', 'Firm Clients'];
      return (
        <div className={`flex items-center gap-1 bg-slate-100 p-1 rounded-xl ${isExtension ? 'flex-wrap' : ''}`}>
          {views.map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`${isExtension ? 'px-3 py-1.5 text-[10px]' : 'px-4 py-2 text-xs'} font-bold rounded-lg transition-all ${activeView === view ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {view}
            </button>
          ))}
        </div>
      );
    }
    if (role === UserRole.TaxPro) {
      return (
        <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-widest">
          <UserCheck size={14} className="text-brand" /> My Assigned Returns
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">Client Management</h2>
          <p className="text-xs text-slate-500">Manage your clients.</p>
        </div>
        {renderTabs()}
      </div>

      <div className={`grid grid-cols-1 ${isExtension ? '' : 'lg:grid-cols-4'} gap-6`}>
        {/* Left Sidebar: Filters & Quick Search (hidden in extension) */}
        <div className={`${isExtension ? 'hidden' : 'lg:col-span-1'} space-y-6`}>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Search Clients</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name or type..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Filter size={14} /> Quick Stats
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-600">Total in View</span>
                  <span className="text-xs font-black text-slate-900">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
                  <span className="text-xs font-bold text-rose-600">Docs Missing</span>
                  <span className="text-xs font-black text-rose-700">{stats.highPriority}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-xs font-bold text-emerald-600">Recently Filed</span>
                  <span className="text-xs font-black text-emerald-700">{stats.filed}</span>
                </div>
              </div>
            </div>
          </div>

          {canAddClients && (
            <div className="bg-[#1e293b] p-6 rounded-2xl text-white relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                <Users size={120} />
              </div>
              {showAddClient ? (
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold">Add New Client</h4>
                    <button onClick={() => { setShowAddClient(false); setAddError(null); setAddSuccess(false); }} className="text-slate-400 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  {addError && (
                    <div className="bg-rose-500/20 text-rose-300 text-xs font-bold p-2 rounded-lg">{addError}</div>
                  )}
                  {addSuccess && (
                    <div className="bg-emerald-500/20 text-emerald-300 text-xs font-bold p-2 rounded-lg">Client added successfully!</div>
                  )}
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-brand"
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    onClick={handleAddClient}
                    disabled={addingClient || !newClientName.trim() || !newClientEmail.trim()}
                    className="w-full py-2 bg-brand text-white text-xs font-bold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {addingClient ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {addingClient ? 'Adding...' : 'Add Client'}
                  </button>
                </div>
              ) : (
                <>
                  <h4 className="text-sm font-bold mb-2">Add a new client</h4>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">Add client details so they can access their portal.</p>
                  <button
                    onClick={() => setShowAddClient(true)}
                    className="w-full py-2 bg-brand text-white text-xs font-bold rounded-lg hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} />
                    Add New Client
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Main List Area */}
        <div className={isExtension ? 'col-span-1' : 'lg:col-span-3'}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button className="p-1.5 text-brand bg-white rounded shadow-sm"><LayoutGrid size={16} /></button>
                <button className="p-1.5 text-slate-400 hover:text-slate-600"><List size={16} /></button>
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">Viewing {activeView}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredReturns.length > 0 ? filteredReturns.map((client) => (
                <div key={client.id} className={`${isExtension ? 'p-3' : 'p-6'} hover:bg-slate-50 transition-colors group`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`${isExtension ? 'w-8 h-8' : 'w-12 h-12'} rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden shrink-0`}>
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${client.clientName}`}
                          alt={client.clientName}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-bold text-slate-800">{client.clientName}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${client.status === TaxReturnStatus.Accepted || client.status === TaxReturnStatus.Filed
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                            }`}>
                            {client.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{client.year} • {client.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned Pro</p>
                        <p className="text-xs font-bold text-slate-700">{client.preparer}</p>
                      </div>
                      <div className="h-8 w-[1px] bg-slate-200 mx-2 hidden sm:block"></div>
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-slate-400 hover:text-brand hover:bg-brand-light rounded-lg transition-all" title="Message Client">
                          <Mail size={18} />
                        </button>
                        <button
                          onClick={() => handleManageReturn(client.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-brand text-xs font-bold rounded-xl hover:bg-brand-light transition-all shadow-sm"
                        >
                          Manage Return
                          <ArrowRight size={14} />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-600">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                    <Users size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-700">No clients found</h3>
                    <p className="text-sm text-slate-400">Try adjusting your filters or search query.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button className="text-xs font-bold text-slate-400 hover:text-brand transition-colors">Show more results</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Clients;