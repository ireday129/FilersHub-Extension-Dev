import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Building2 } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { GhlContext } from '../hooks/useGhlContext';

interface StaffLoginProps {
    ghlContext?: GhlContext | null;
}

const StaffLogin: React.FC<StaffLoginProps> = ({ ghlContext }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [crmLoading, setCrmLoading] = useState(false);
    const [crmError, setCrmError] = useState('');
    const [showPasswordLogin, setShowPasswordLogin] = useState(!ghlContext);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
        } catch (error: any) {
            console.error('Login error:', error);
            alert(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const handleCrmLogin = async () => {
        if (!email) {
            setCrmError('Please enter your email address first.');
            return;
        }
        setCrmError('');
        setCrmLoading(true);
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const resp = await fetch(`${supabaseUrl}/functions/v1/crm-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'email-lookup', email }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                setCrmError(data.error || 'CRM login failed');
                return;
            }
            const { error } = await supabase.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
            });
            if (error) throw error;
        } catch (err: any) {
            setCrmError(err.message || 'CRM login failed');
        } finally {
            setCrmLoading(false);
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

                {/* GHL Context Banner */}
                {ghlContext && (
                    <div className="mx-8 mt-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 className="text-emerald-600" size={16} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-emerald-800">CRM Location Detected</p>
                            <p className="text-xs text-emerald-600">Enter your email to sign in to your firm workspace.</p>
                        </div>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLogin} className="p-8 pt-6 space-y-5">
                    {/* Email field — always shown */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email Address</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@yourfirm.com"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    {/* GHL detected: CRM login is primary */}
                    {ghlContext && (
                        <>
                            <button
                                type="button"
                                onClick={handleCrmLogin}
                                disabled={isLoading || crmLoading}
                                className="w-full py-3 bg-[#42ab31] hover:bg-[#3d9c2e] text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {crmLoading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                ) : (
                                    <>
                                        <Building2 size={18} />
                                        Sign in with CRM
                                    </>
                                )}
                            </button>
                            {crmError && (
                                <p className="text-sm text-red-500 text-center">{crmError}</p>
                            )}

                            {!showPasswordLogin && (
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordLogin(true)}
                                    className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-2"
                                >
                                    Use password instead
                                </button>
                            )}
                        </>
                    )}

                    {/* Password section: shown by default without GHL, toggleable with GHL */}
                    {showPasswordLogin && (
                        <>
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
                                        required={!ghlContext}
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
                        </>
                    )}

                    {/* No GHL context: CRM login is secondary */}
                    {!ghlContext && (
                        <>
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
                                onClick={handleCrmLogin}
                                disabled={isLoading || crmLoading}
                                className="w-full py-3 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {crmLoading ? (
                                    <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></span>
                                ) : (
                                    <>
                                        <Building2 size={18} />
                                        Sign in with CRM
                                    </>
                                )}
                            </button>
                            {crmError && (
                                <p className="text-sm text-red-500 text-center">{crmError}</p>
                            )}
                        </>
                    )}
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
