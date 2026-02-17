import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Building2, Send, CheckCircle2 } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { GhlContext } from '../hooks/useGhlContext';
import { FILERSHUB_LOGO_URL } from '../constants';

interface StaffLoginProps {
    ghlContext?: GhlContext | null;
}

interface FirmChoice {
    firm_id: string;
    firm_name: string;
    logo_url: string | null;
}

const StaffLogin: React.FC<StaffLoginProps> = ({ ghlContext }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [crmLoading, setCrmLoading] = useState(false);
    const [crmError, setCrmError] = useState('');
    const [showPasswordLogin, setShowPasswordLogin] = useState(!ghlContext);
    const [firmChoices, setFirmChoices] = useState<FirmChoice[]>([]);
    const [magicLinkLoading, setMagicLinkLoading] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);

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
            setCrmError(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const handleCrmLogin = async (overrideFirmId?: string) => {
        if (!email) {
            setCrmError('Please enter your email address first.');
            return;
        }
        setCrmError('');
        setFirmChoices([]);
        setCrmLoading(true);
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const payload: Record<string, string> = { action: 'email-lookup', email };
            if (overrideFirmId) {
                payload.firmId = overrideFirmId;
            } else if (ghlContext?.locationId) {
                payload.locationId = ghlContext.locationId;
            }
            const resp = await fetch(`${supabaseUrl}/functions/v1/crm-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();

            // Handle multi-firm response
            if (data.error === 'multiple_firms' && data.firms?.length) {
                setFirmChoices(data.firms);
                return;
            }

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

    const handleMagicLink = async () => {
        if (!email) {
            setCrmError('Please enter your email address first.');
            return;
        }
        setCrmError('');
        setMagicLinkLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });
            if (error) throw error;
            setMagicLinkSent(true);
        } catch (err: any) {
            setCrmError(err.message || 'Failed to send magic link');
        } finally {
            setMagicLinkLoading(false);
        }
    };

    const logoUrl = FILERSHUB_LOGO_URL;

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

                {/* Firm Selector — shown when user belongs to multiple firms */}
                {firmChoices.length > 0 && (
                    <div className="p-8 pt-6 space-y-4">
                        <div className="text-center">
                            <p className="text-sm font-bold text-slate-700">Select Your Firm</p>
                            <p className="text-xs text-slate-500 mt-1">Your email is associated with multiple firms.</p>
                        </div>
                        <div className="space-y-2">
                            {firmChoices.map((firm) => (
                                <button
                                    key={firm.firm_id}
                                    type="button"
                                    onClick={() => handleCrmLogin(firm.firm_id)}
                                    disabled={crmLoading}
                                    className="w-full p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl flex items-center gap-3 transition-all text-left"
                                >
                                    {firm.logo_url ? (
                                        <img src={firm.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                    ) : (
                                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                                            <Building2 className="text-indigo-600" size={16} />
                                        </div>
                                    )}
                                    <span className="text-sm font-semibold text-slate-700">{firm.firm_name}</span>
                                    <ArrowRight className="ml-auto text-slate-400" size={16} />
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => { setFirmChoices([]); setCrmError(''); }}
                            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-2"
                        >
                            Back to login
                        </button>
                    </div>
                )}

                {/* Login Form */}
                {firmChoices.length === 0 && (
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
                                onClick={() => handleCrmLogin()}
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

                            {magicLinkSent && (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                                    <CheckCircle2 className="text-emerald-600 mx-auto" size={24} />
                                    <p className="text-sm font-bold text-emerald-800">Magic link sent!</p>
                                    <p className="text-xs text-emerald-600">Check your email and click the link to sign in.</p>
                                    <button
                                        type="button"
                                        onClick={() => setMagicLinkSent(false)}
                                        className="text-xs text-slate-400 hover:text-slate-600 mt-2"
                                    >
                                        Didn't receive it? Try again
                                    </button>
                                </div>
                            )}

                            {!showPasswordLogin && !magicLinkSent && (
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleMagicLink}
                                        disabled={magicLinkLoading}
                                        className="text-xs text-slate-400 hover:text-indigo-600 py-2 flex items-center gap-1"
                                    >
                                        {magicLinkLoading ? (
                                            <span className="w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin"></span>
                                        ) : (
                                            <Send size={12} />
                                        )}
                                        Email me a link
                                    </button>
                                    <span className="text-slate-300">|</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordLogin(true)}
                                        className="text-xs text-slate-400 hover:text-slate-600 py-2"
                                    >
                                        Use password instead
                                    </button>
                                </div>
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

                    {/* Magic link sent confirmation */}
                    {magicLinkSent && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                            <CheckCircle2 className="text-emerald-600 mx-auto" size={24} />
                            <p className="text-sm font-bold text-emerald-800">Magic link sent!</p>
                            <p className="text-xs text-emerald-600">Check your email and click the link to sign in.</p>
                            <button
                                type="button"
                                onClick={() => setMagicLinkSent(false)}
                                className="text-xs text-slate-400 hover:text-slate-600 mt-2"
                            >
                                Didn't receive it? Try again
                            </button>
                        </div>
                    )}

                    {/* No GHL context: alternative login methods */}
                    {!ghlContext && !magicLinkSent && (
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
                                onClick={handleMagicLink}
                                disabled={isLoading || magicLinkLoading}
                                className="w-full py-3 bg-white border-2 border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-600 font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {magicLinkLoading ? (
                                    <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></span>
                                ) : (
                                    <>
                                        <Send size={16} />
                                        Email me a login link
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => handleCrmLogin()}
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
                )}

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
