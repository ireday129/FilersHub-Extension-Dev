import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Bell, ShieldCheck, Download, AlertCircle, FileSearch, Scale } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Standard transcript codes mapped from the technical spec
export const TRANSCRIPT_CODES = [
    { code: '150', category: 'Filing', description: 'Return Filed', icon: FileSearch },
    { code: '977', category: 'Filing', description: 'Amended Return Filed', icon: FileSearch },
    { code: '670', category: 'Payment', description: 'Payment Applied', icon: Download },
    { code: '766', category: 'Refund', description: 'Credit to Account', icon: ShieldCheck },
    { code: '768', category: 'Refund', description: 'Earned Income Credit', icon: ShieldCheck },
    { code: '846', category: 'Refund', description: 'Refund Issued', icon: ShieldCheck },
    { code: '420', category: 'Exam', description: 'Examination Initiated', icon: AlertCircle },
    { code: '421', category: 'Exam', description: 'Examination Closed', icon: AlertCircle },
    { code: '570', category: 'Hold', description: 'Additional Account Action Pending', icon: Scale },
    { code: '571', category: 'Hold', description: 'Resolved Additional Action', icon: Scale },
    { code: '810', category: 'Hold', description: 'Refund Freeze', icon: Scale },
    { code: '811', category: 'Hold', description: 'Refund Freeze Reversed', icon: Scale },
    { code: '826', category: 'Offset', description: 'Overpayment Transferred', icon: AlertCircle },
    { code: '898', category: 'Offset', description: 'Treasury Offset', icon: AlertCircle },
    { code: '971', category: 'Notice', description: 'Notice Issued', icon: Bell },
];

interface Preference {
    transcript_code: string;
    alert_enabled: boolean;
    notify_email: boolean;
    notify_sms: boolean;
}

export default function AlertPreferences() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<Record<string, Preference>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        // Seed defaults for any codes not yet in the DB
        const loadPreferences = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('alert_preferences')
                    .select('transcript_code, alert_enabled, notify_email, notify_sms')
                    .eq('user_id', user.id);

                if (error) throw error;

                const prefsMap: Record<string, any> = {};

                // Populate with db data
                (data || []).forEach((row) => {
                    prefsMap[row.transcript_code] = row;
                });

                // Fill gaps with defaults
                TRANSCRIPT_CODES.forEach((tc) => {
                    if (!prefsMap[tc.code]) {
                        prefsMap[tc.code] = {
                            transcript_code: tc.code,
                            alert_enabled: true,
                            notify_email: true,
                            notify_sms: false,
                        };
                    }
                });

                setPreferences(prefsMap);
            } catch (err) {
                console.error('Failed to load alert preferences', err);
            } finally {
                setLoading(false);
            }
        };

        loadPreferences();
    }, [user]);

    const handleToggle = (code: string, field: 'alert_enabled' | 'notify_email' | 'notify_sms') => {
        setPreferences(prev => ({
            ...prev,
            [code]: {
                ...prev[code],
                [field]: !prev[code][field]
            }
        }));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);

        try {
            const upsertPayload = Object.values(preferences).map((pref: Preference) => ({
                user_id: user.id,
                transcript_code: pref.transcript_code,
                code_description: TRANSCRIPT_CODES.find(tc => tc.code === pref.transcript_code)?.description || '',
                alert_enabled: pref.alert_enabled,
                notify_email: pref.notify_email,
                notify_sms: pref.notify_sms,
            }));

            const { error } = await supabase.from('alert_preferences').upsert(upsertPayload, { onConflict: 'user_id, transcript_code' });

            if (error) throw error;
            alert('Alert preferences saved successfully.');
        } catch (err) {
            console.error('Failed to save preferences', err);
            alert('Error saving preferences.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-slate-500 animate-pulse">Loading preferences...</div>;

    const groupedCodes = TRANSCRIPT_CODES.reduce((acc, code) => {
        acc[code.category] = acc[code.category] || [];
        acc[code.category].push(code);
        return acc;
    }, {} as Record<string, typeof TRANSCRIPT_CODES>);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Bell className="text-emerald-600" size={24} />
                        Alert Preferences
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Configure which transcript transaction codes trigger notifications.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                    {saving ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {Object.entries(groupedCodes).map(([category, codes]) => (
                    <div key={category} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{category}</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {codes.map(({ code, description, icon: Icon }) => {
                                const pref = preferences[code] as { alert_enabled: boolean; notify_email: boolean; notify_sms: boolean } | undefined;
                                return (
                                    <div key={code} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className="p-2 bg-slate-100 rounded-lg shrink-0 mt-0.5">
                                                <Icon size={18} className="text-slate-500" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">
                                                        {code}
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-800">{description}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 pl-14 sm:pl-0 shrink-0">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={pref?.notify_email || false}
                                                    onChange={() => handleToggle(code, 'notify_email')}
                                                    disabled={!pref?.alert_enabled}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-50"
                                                />
                                                <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">Email</span>
                                            </label>

                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={pref?.notify_sms || false}
                                                    onChange={() => handleToggle(code, 'notify_sms')}
                                                    disabled={!pref?.alert_enabled}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-50"
                                                />
                                                <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">SMS</span>
                                            </label>

                                            <div className="w-px h-6 bg-slate-200 mx-2 hidden sm:block"></div>

                                            <button
                                                onClick={() => handleToggle(code, 'alert_enabled')}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${pref?.alert_enabled ? 'bg-emerald-500' : 'bg-slate-200'
                                                    }`}
                                            >
                                                <span className="sr-only">Enable Alert Form</span>
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pref?.alert_enabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
