import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldAlert } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { FILERSHUB_LOGO_URL } from '../constants';

const SuperAdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Success! AuthContext will pick up the session change.
            // Since we are already on /super-admin, the App component will re-render
            // and fall through to the authenticated check, showing the dashboard.

        } catch (error: any) {
            console.error('Login error:', error);
            alert(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const logoUrl = FILERSHUB_LOGO_URL;

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
            <WatermarkBackground text="ADMINISTRATION" />
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700 overflow-hidden relative z-10">
                {/* Header */}
                <div className="p-8 pb-6 text-center border-b border-slate-100">
                    <img src={logoUrl} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <h1 className="text-xl font-bold text-slate-900 flex items-center justify-center gap-2">
                        <ShieldAlert className="text-rose-600" size={20} />
                        Platform Administration
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Restricted access. Authorized personnel only.
                    </p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="p-8 pt-6 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Admin Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-600 transition-colors" size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@filershub.com"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-600 transition-colors" size={18} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-300 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                Authenticate <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                        <Lock size={12} />
                        <span>Secure End-to-End Encryption</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminLogin;
