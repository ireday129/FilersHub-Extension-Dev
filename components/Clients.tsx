import React, { useState, useMemo } from 'react';
import { UserRole, TaxReturn, TaxReturnStatus, NavItem, TAX_RETURN_TYPES, TAX_YEARS } from '../types';
import { useExtensionMode } from '../hooks/useExtensionMode';
import { supabase } from '../services/supabase';
import {
  Users,
  Search,
  ArrowRight,
  ArrowLeft,
  Clock,
  Filter,
  UserCheck,
  Plus,
  X,
  Loader2,
  FileText,
  ChevronRight,
  Calendar,
  User
} from 'lucide-react';

interface ClientsProps {
  role: UserRole;
  returns: TaxReturn[];
  setSelectedReturnId: (id: string | null) => void;
  setActiveTab: (tab: NavItem) => void;
  firmId: string | null;
  refreshData: () => Promise<void>;
  currentStaffName?: string;
}

type ClientView = 'My Clients' | 'Firm Clients';

interface ClientGroup {
  clientId: string;
  name: string;
  returns: TaxReturn[];
  returnCount: number;
  preparer: string;
  latestStatus: TaxReturnStatus;
}

const Clients: React.FC<ClientsProps> = ({ role, returns, setSelectedReturnId, setActiveTab, firmId, refreshData, currentStaffName }) => {
  const { isExtension } = useExtensionMode();
  const [activeView, setActiveView] = useState<ClientView>('My Clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);

  // Add Client form state
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // Create Return modal state
  const [createReturnClientId, setCreateReturnClientId] = useState<string | null>(null);
  const [createReturnYear, setCreateReturnYear] = useState('');
  const [createReturnType, setCreateReturnType] = useState('');
  const [creatingReturn, setCreatingReturn] = useState(false);
  const [createReturnError, setCreateReturnError] = useState<string | null>(null);

  const groupedReturnTypes = useMemo(() => {
    const groups: Record<string, { key: string; label: string }[]> = {};
    Object.entries(TAX_RETURN_TYPES).forEach(([key, val]) => {
      if (!groups[val.category]) groups[val.category] = [];
      groups[val.category].push({ key, label: val.label });
    });
    return groups;
  }, []);

  const handleCreateReturn = async () => {
    if (!createReturnClientId || !createReturnYear || !createReturnType || !firmId) return;
    setCreatingReturn(true);
    setCreateReturnError(null);

    try {
      const { error } = await supabase
        .from('tax_returns')
        .insert({
          client_id: createReturnClientId,
          firm_id: firmId,
          tax_year: createReturnYear,
          return_type: createReturnType,
          tax_return_status: 'Intake Received',
        });

      if (error) throw error;

      setCreateReturnClientId(null);
      setCreateReturnYear('');
      setCreateReturnType('');
      await refreshData();
    } catch (err: any) {
      setCreateReturnError(err.message || 'Failed to create return.');
    } finally {
      setCreatingReturn(false);
    }
  };

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
      });

      if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
          setAddError('A client with this email already exists for your firm.');
        } else {
          throw error;
        }
        return;
      }

      // Invite client to Supabase Auth so they can log in to their portal
      try {
        const resp = await fetch('/api/invite-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: newClientEmail.trim().toLowerCase(),
            firmId,
            fullName: newClientName.trim(),
          }),
        });
        const result = await resp.json();
        if (!resp.ok) {
          console.error('Auth invite failed:', result.error);
        }
      } catch (inviteErr) {
        console.error('Failed to send auth invite:', inviteErr);
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

  const staffName = currentStaffName || '';

  const filteredReturns = useMemo(() => {
    let base = [...returns];

    if (activeView === 'My Clients' || role === UserRole.TaxPro) {
      base = base.filter(r => r.preparer === staffName);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(r =>
        r.clientName.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }

    return base;
  }, [returns, activeView, staffName, role, searchQuery]);

  // Group returns by client name (using clientId as the grouping key)
  const clientGroups = useMemo((): ClientGroup[] => {
    const map: Record<string, { clientId: string; name: string; returns: TaxReturn[] }> = {};
    filteredReturns.forEach(r => {
      const key = r.clientId;
      if (!map[key]) map[key] = { clientId: r.clientId, name: r.clientName, returns: [] };
      map[key].returns.push(r);
    });
    return Object.values(map).map(({ clientId, name, returns: rets }) => ({
      clientId,
      name,
      returns: rets,
      returnCount: rets.filter(r => r.year && r.type).length,
      preparer: rets[0]?.preparer || '',
      latestStatus: rets[0]?.status,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredReturns]);

  const selectedClient = useMemo(() => {
    if (!selectedClientName) return null;
    return clientGroups.find(g => g.name === selectedClientName) || null;
  }, [selectedClientName, clientGroups]);

  const stats = useMemo(() => {
    return {
      total: clientGroups.length,
      highPriority: filteredReturns.filter(r => r.status === TaxReturnStatus.MissingDocuments).length,
      filed: filteredReturns.filter(r => r.status === TaxReturnStatus.Filed).length,
    };
  }, [clientGroups, filteredReturns]);

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
              onClick={() => { setActiveView(view); setSelectedClientName(null); }}
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

  // Client Detail View
  const renderClientDetail = () => {
    if (!selectedClient) return null;
    const clientReturns = selectedClient.returns;
    const clientId = selectedClient.clientId;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Back button + Client header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedClientName(null)}
            className="p-2 text-slate-400 hover:text-brand hover:bg-brand-light rounded-lg transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`${isExtension ? 'w-10 h-10' : 'w-14 h-14'} rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden shrink-0`}>
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedClient.name}`}
                alt={selectedClient.name}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{selectedClient.name}</h2>
              <p className="text-xs text-slate-500">
                {selectedClient.returnCount} {selectedClient.returnCount === 1 ? 'return' : 'returns'}
                {selectedClient.preparer && ` • Assigned to ${selectedClient.preparer}`}
              </p>
            </div>
          </div>
        </div>

        {/* Returns list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={`${isExtension ? 'p-3' : 'px-6 py-4'} bg-slate-50 border-b border-slate-100 flex items-center justify-between`}>
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileText size={16} className="text-brand" />
              Tax Returns
            </h3>
            <button
              onClick={() => { setCreateReturnClientId(clientId); setCreateReturnYear(''); setCreateReturnType(''); setCreateReturnError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-all"
            >
              <Plus size={14} />
              New Return
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {clientReturns.filter(r => r.year && r.type).length > 0 ? (
              clientReturns.filter(r => r.year && r.type).map(ret => (
                <div key={ret.id} className={`${isExtension ? 'p-3' : 'p-5'} hover:bg-slate-50 transition-colors group`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-light rounded-xl flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-brand" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-bold text-slate-800 text-sm">{ret.type}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ret.status === TaxReturnStatus.Accepted || ret.status === TaxReturnStatus.Filed
                              ? 'bg-emerald-100 text-emerald-700'
                              : ret.status === TaxReturnStatus.MissingDocuments || ret.status === TaxReturnStatus.Rejected
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {ret.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {ret.year}
                          </span>
                          {ret.preparer && (
                            <span className="flex items-center gap-1">
                              <User size={12} />
                              {ret.preparer}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {ret.date}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {ret.files.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                          {ret.files.length} {ret.files.length === 1 ? 'doc' : 'docs'}
                        </span>
                      )}
                      <button
                        onClick={() => handleManageReturn(ret.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-brand text-xs font-bold rounded-xl hover:bg-brand-light transition-all shadow-sm"
                      >
                        Manage Return
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <FileText size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">No returns yet</h4>
                  <p className="text-xs text-slate-400 mt-1">Create a tax return for this client to get started.</p>
                </div>
                <button
                  onClick={() => { setCreateReturnClientId(clientId); setCreateReturnYear(''); setCreateReturnType(''); setCreateReturnError(null); }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand/90 transition-all shadow-sm mx-auto"
                >
                  <Plus size={14} />
                  Create Return
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {!selectedClientName && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-800">Client Management</h2>
            <p className="text-xs text-slate-500">Manage your clients.</p>
          </div>
          {renderTabs()}
        </div>
      )}

      {selectedClientName ? renderClientDetail() : (
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
                    <span className="text-xs font-bold text-slate-600">Total Clients</span>
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
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase shrink-0">
                  {stats.total} {stats.total === 1 ? 'Client' : 'Clients'}
                </span>
                {isExtension && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] w-28 focus:ring-2 focus:ring-brand outline-none"
                      />
                    </div>
                    {canAddClients && (
                      <button
                        onClick={() => setShowAddClient(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-brand text-white text-[11px] font-bold rounded-lg hover:bg-brand/90 transition-all shrink-0"
                      >
                        <Plus size={12} />
                        Add
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {clientGroups.length > 0 ? clientGroups.map((client) => (
                  <button
                    key={client.name}
                    onClick={() => setSelectedClientName(client.name)}
                    className={`w-full ${isExtension ? 'p-3' : 'p-5'} hover:bg-slate-50 transition-colors group text-left`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`${isExtension ? 'w-8 h-8' : 'w-11 h-11'} rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden shrink-0`}>
                          <img
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${client.name}`}
                            alt={client.name}
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-bold text-slate-800 truncate group-hover:text-brand transition-colors ${isExtension ? 'text-xs' : 'text-sm'}`}>
                            {client.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            {client.returnCount > 0 ? (
                              <>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {client.returnCount} {client.returnCount === 1 ? 'return' : 'returns'}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  client.latestStatus === TaxReturnStatus.Accepted || client.latestStatus === TaxReturnStatus.Filed
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : client.latestStatus === TaxReturnStatus.MissingDocuments || client.latestStatus === TaxReturnStatus.Rejected
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {client.latestStatus}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">No return created</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {!isExtension && client.preparer && (
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preparer</p>
                            <p className="text-xs font-bold text-slate-600">{client.preparer}</p>
                          </div>
                        )}
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-brand transition-colors" />
                      </div>
                    </div>
                  </button>
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
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal (extension mode) */}
      {isExtension && showAddClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAddClient(false); setAddError(null); setAddSuccess(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Add New Client</h3>
              <button onClick={() => { setShowAddClient(false); setAddError(null); setAddSuccess(false); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {addError && (
                <div className="bg-rose-50 text-rose-600 text-xs font-bold p-2.5 rounded-xl border border-rose-100">{addError}</div>
              )}
              {addSuccess && (
                <div className="bg-emerald-50 text-emerald-600 text-xs font-bold p-2.5 rounded-xl border border-emerald-100">Client added!</div>
              )}
              <input
                type="text"
                placeholder="Full Name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand outline-none"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand outline-none"
              />
              <button
                onClick={handleAddClient}
                disabled={addingClient || !newClientName.trim() || !newClientEmail.trim()}
                className="w-full py-2.5 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addingClient ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {addingClient ? 'Adding...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Return Modal */}
      {createReturnClientId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCreateReturnClientId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Create Tax Return</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  For: {returns.find(r => r.clientId === createReturnClientId)?.clientName}
                </p>
              </div>
              <button onClick={() => setCreateReturnClientId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {createReturnError && (
                <div className="bg-rose-50 text-rose-600 text-xs font-bold p-3 rounded-xl border border-rose-100">{createReturnError}</div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Tax Year</label>
                <select
                  value={createReturnYear}
                  onChange={(e) => setCreateReturnYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                >
                  <option value="">-- Select Tax Year --</option>
                  {Object.entries(TAX_YEARS).map(([key, val]) => (
                    <option key={key} value={val.label}>{val.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Return Type</label>
                <select
                  value={createReturnType}
                  onChange={(e) => setCreateReturnType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                >
                  <option value="">-- Select Return Type --</option>
                  {Object.entries(groupedReturnTypes).map(([category, items]) => (
                    <optgroup key={category} label={category}>
                      {(items as { key: string; label: string }[]).map(item => (
                        <option key={item.key} value={item.label}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 pt-0">
              <button
                onClick={handleCreateReturn}
                disabled={creatingReturn || !createReturnYear || !createReturnType}
                className="w-full py-3 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand/90 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingReturn ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {creatingReturn ? 'Creating...' : 'Create Tax Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
