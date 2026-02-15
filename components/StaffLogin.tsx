import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { Lock, Mail, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';

const StaffLogin: React.FC = () => {
    // const { bypassAuth } = useAuth(); // Removed mock auth
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.TaxPro); // Removed mock role state

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Success! AuthContext will pick up the session change automatically.
            // App.tsx will re-render and redirect to the dashboard.

        } catch (error: any) {
            console.error('Login error:', error);
            alert(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const logoUrl = "https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png";

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <WatermarkBackground />
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative z-10">
                {/* Header */}
                <div className="p-8 pb-6 text-center border-b border-slate-50">
                    <img src={logoUrl} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <h1 className="text-xl font-bold text-slate-800 flex items-center justify-center gap-2">
                        <ShieldCheck className="text-indigo-600" size={20} />
                        Staff Access
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Secure login for FilersHub team members.
                    </p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="p-8 pt-6 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email Address</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@filershub.com"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-[#42ab31] hover:bg-[#3d9c2e] text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                Sign In to Workspace <ArrowRight size={18} />
                            </>
                        )}
                    </button>

                    <div className="relative my-5">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-3 bg-white text-slate-400 text-xs font-medium">Or</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                            window.location.href = `${supabaseUrl}/functions/v1/crm-auth/init?action=login`;
                        }}
                        disabled={isLoading}
                        className="w-full py-3 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <ExternalLink size={18} />
                        Login with CRM
                    </button>
                </form>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                        Protected by FilersHub Enterprise Security
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StaffLogin;
