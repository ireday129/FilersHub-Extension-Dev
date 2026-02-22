import React, { useState } from 'react';
import ClientsMonitor from './ClientsMonitor';
import AlertPreferences from './AlertPreferences';
import AlertHistory from './AlertHistory';
import { Shield, Bell, History } from 'lucide-react';

type Tab = 'clients' | 'preferences' | 'history';

export default function TranscriptMonitorHub() {
    const [activeTab, setActiveTab] = useState<Tab>('clients');

    const tabs = [
        { id: 'clients', label: 'Monitored Clients', icon: Shield },
        { id: 'preferences', label: 'Alert Preferences', icon: Bell },
        { id: 'history', label: 'Alert History', icon: History },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Shield className="text-emerald-600" size={24} />
                            IRS Transcript Monitor
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-2">PRO</span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Manage client monitoring, configure alert rules, and view triggered events.</p>
                    </div>
                </div>

                <div className="flex overflow-x-auto hide-scrollbar border-b border-slate-200">
                    <div className="flex space-x-8 px-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as Tab)}
                                    className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-bold text-sm whitespace-nowrap transition-colors
                    ${isActive
                                            ? 'border-emerald-600 text-emerald-600'
                                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                  `}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {activeTab === 'clients' && <ClientsMonitor />}
                {activeTab === 'preferences' && <AlertPreferences />}
                {activeTab === 'history' && <AlertHistory />}
            </div>
        </div>
    );
}
