import React from 'react';
import { UserRole } from '../types';
import { Building2, ChevronRight, LogOut } from 'lucide-react';

export interface FirmOption {
    id: string;
    name: string;
    logo: string;
    role: UserRole;
    brandColor: string;
}

interface FirmSelectionProps {
    firms: FirmOption[];
    onSelect: (firmId: string) => void;
    onLogout: () => void;
    userEmail?: string;
}

const FirmSelection: React.FC<FirmSelectionProps> = ({ firms, onSelect, onLogout, userEmail }) => {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-6">
                        <Building2 size={32} className="text-brand" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Select Organization</h1>
                    <p className="text-slate-500 text-sm">
                        You are associated with multiple organizations. <br />
                        Please select which one you'd like to access.
                    </p>
                    {userEmail && (
                        <p className="text-xs text-slate-400 font-medium bg-slate-100/50 inline-block px-3 py-1 rounded-full">
                            Logged in as {userEmail}
                        </p>
                    )}
                </div>

                <div className="space-y-3">
                    {firms.map((firm) => (
                        <button
                            key={firm.id}
                            onClick={() => onSelect(firm.id)}
                            className="w-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-brand/30 rounded-2xl p-4 flex items-center justify-between group transition-all shadow-sm hover:shadow-md text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                    {firm.logo ? (
                                        <img src={firm.logo} alt={firm.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Building2 size={20} className="text-slate-400" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 group-hover:text-brand transition-colors">{firm.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span
                                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 group-hover:bg-brand-light group-hover:text-brand group-hover:border-brand/20 transition-colors"
                                        >
                                            {firm.role}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-brand group-hover:translate-x-1 transition-all" />
                        </button>
                    ))}
                </div>

                <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-rose-500 transition-colors pt-4"
                >
                    <LogOut size={16} />
                    Sign Out
                </button>

            </div>
        </div>
    );
};

export default FirmSelection;
