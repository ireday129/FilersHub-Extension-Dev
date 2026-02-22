import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { History, Download, Clock, AlertCircle } from 'lucide-react';

interface AlertLog {
    id: string;
    transcript_code: string;
    code_description: string;
    client_name: string;
    notification_channel: string;
    delivery_status: 'sent' | 'failed' | 'pending';
    created_at: string;
}

export default function AlertHistory() {
    const { user } = useAuth();
    const [logs, setLogs] = useState<AlertLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const loadHistory = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('alert_log')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setLogs(data || []);
            } catch (err) {
                console.error('Failed to load alert history:', err);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [user]);

    const exportCsv = () => {
        const headers = ['Date', 'Client', 'Code', 'Description', 'Channel', 'Status'];
        const rows = logs.map(log => [
            new Date(log.created_at).toLocaleString(),
            log.client_name,
            log.transcript_code,
            log.code_description,
            log.notification_channel,
            log.delivery_status
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `irs_alert_history_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <History className="text-emerald-600" size={24} />
                        Alert History
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Audit log of all notifications triggered by transcript changes.</p>
                </div>
                <button
                    onClick={exportCsv}
                    disabled={logs.length === 0}
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    <Download size={16} />
                    Export CSV
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500">Loading history...</div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-lg font-bold text-slate-700">No Alerts Sent Yet</p>
                        <p className="max-w-sm mx-auto mt-2 text-sm text-slate-500">When new transcript codes are detected during routine polling, the alerts will appear here.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date / Time</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Client</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Event Details</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString(undefined, {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                                hour: 'numeric', minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-slate-800">{log.client_name}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                                    {log.transcript_code}
                                                </span>
                                                <span className="text-sm font-medium text-slate-700">{log.code_description}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide
                          ${log.delivery_status === 'sent' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                        log.delivery_status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                            'bg-amber-50 text-amber-700 border border-amber-200'}
                        `}>
                                                    {log.delivery_status}
                                                </span>
                                                <span className="text-[10px] text-slate-400 capitalize">via {log.notification_channel}</span>
                                            </div>
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
