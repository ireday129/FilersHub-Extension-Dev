import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFirmData } from '../hooks/useFirmData';
import { Users, Search, ShieldAlert, CheckCircle2, Shield, Loader2 } from 'lucide-react';

interface GhlContact {
    id: string;
    name: string;
    email: string;
    tin: string; // The TIN field extracted from custom fields
    tinType: 'SSN' | 'EIN' | 'UNKNOWN';
}

interface MonitoredClient extends GhlContact {
    monitored_id?: string;
    isMonitored: boolean;
    lastPolledAt?: string;
}

export default function ClientsMonitor() {
    const { user } = useAuth();
    const { firmId } = useFirmData();
    const [clients, setClients] = useState<MonitoredClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);

    // We need to fetch GHL contacts that have a TIN Custom field, and join them with 'monitored_clients'
    const loadClients = async () => {
        if (!user || !firmId) return;
        setLoading(true);
        try {
            // 1. Fetch monitored clients from DB
            const { data: dbMonitored } = await supabase
                .from('monitored_clients')
                .select('*')
                .eq('user_id', user.id);

            const monitoredMap = new Map((dbMonitored || []).map(m => [m.ghl_contact_id, m]));

            // 2. We mock the GHL fetch for now until backend integration is finalized.
            // In production, we'd call an edge function that lists contacts with the contact.tin field.
            const mockGhlContacts: GhlContact[] = [
                { id: 'contact_1', name: 'Acme Corp', email: 'billing@acme.com', tin: 'XX-XXX1234', tinType: 'EIN' },
                { id: 'contact_2', name: 'John Doe', email: 'john@example.com', tin: 'XXX-XX-5678', tinType: 'SSN' },
                { id: 'contact_3', name: 'Jane Smith', email: 'jane@example.com', tin: 'XXX-XX-9012', tinType: 'SSN' },
            ];

            const merged: MonitoredClient[] = mockGhlContacts.map(c => {
                const dbInfo = monitoredMap.get(c.id);
                return {
                    ...c,
                    monitored_id: dbInfo?.id,
                    isMonitored: dbInfo ? dbInfo.monitoring_active : false,
                    lastPolledAt: dbInfo?.last_poll_at
                };
            });

            setClients(merged);
        } catch (err) {
            console.error('Failed to load monitored clients:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClients();
    }, [user, firmId]);

    const toggleMonitoring = async (client: MonitoredClient) => {
        if (!user) return;
        const newState = !client.isMonitored;

        // Optimistic update
        setClients(prev => prev.map(c =>
            c.id === client.id ? { ...c, isMonitored: newState } : c
        ));

        try {
            if (newState) {
                // Upsert to start monitoring
                await supabase.from('monitored_clients').upsert({
                    user_id: user.id,
                    ghl_contact_id: client.id,
                    client_name: client.name,
                    tin: client.tin, // Note: Should be properly encrypted in production
                    tin_type: client.tinType,
                    monitoring_active: true
                });
            } else {
                // Toggle off
                if (client.monitored_id) {
                    await supabase.from('monitored_clients')
                        .update({ monitoring_active: false })
                        .eq('id', client.monitored_id);
                }
            }
        } catch (err) {
            console.error('Failed to toggle monitoring:', err);
            // Revert on error
            setClients(prev => prev.map(c =>
                c.id === client.id ? { ...c, isMonitored: !newState } : c
            ));
        }
    };

    const syncGhlContacts = async () => {
        setSyncing(true);
        // Mock sync delay
        await new Promise(r => setTimeout(r, 1500));
        await loadClients();
        setSyncing(false);
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-emerald-600" size={24} />
                        Monitored Clients
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Select which CRM contacts to actively monitor for IRS transcript updates.</p>
                </div>
                <button
                    onClick={syncGhlContacts}
                    disabled={syncing}
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    {syncing ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                    {syncing ? 'Syncing...' : 'Sync GHL Contacts'}
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search clients by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-4" />
                        Loading clients...
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <ShieldAlert size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-lg font-bold text-slate-700">No Eligible Clients Found</p>
                        <p className="max-w-md mx-auto mt-2 text-sm">
                            We only show GHL contacts that have a valid SSN or EIN in the designated <code>contact.tin</code> custom field. Update your CRM contacts and sync again.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Client</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">TIN Type</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Polled</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800">{client.name}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{client.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold tracking-wider">
                                                {client.tinType}
                                            </span>
                                            <div className="text-xs text-slate-400 mt-1 font-mono">{client.tin}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {client.lastPolledAt ? new Date(client.lastPolledAt).toLocaleString() : 'Never'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {client.isMonitored ? (
                                                <button
                                                    onClick={() => toggleMonitoring(client)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors border border-emerald-200"
                                                >
                                                    <CheckCircle2 size={14} /> Active
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => toggleMonitoring(client)}
                                                    className="inline-flex items-center px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold transition-colors border border-slate-200 shadow-sm"
                                                >
                                                    Enable Monitoring
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
