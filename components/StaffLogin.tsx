import React, { useState, useEffect, useRef } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Building2, Send, CheckCircle2 } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { GhlContext } from '../hooks/useGhlContext';
import { FILERSHUB_LOGO_URL } from '../constants';

interface StaffLoginProps {
    ghlContext?: GhlContext | null;
}

const StaffLogin: React.FC<StaffLoginProps> = ({ ghlContext }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [magicLinkLoading, setMagicLinkLoading] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Magic link won't work in iframes due to third-party storage partitioning
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;

    // Poll for session after magic link is sent (handles cross-tab login)
    useEffect(() => {
        if (!magicLinkSent) {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }

        pollRef.current = setInterval(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                clearInterval(pollRef.current!);
                pollRef.current = null;
                // Force auth state refresh so the app re-renders
                await supabase.auth.setSession({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token,
                });
            }
        }, 2000);

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [magicLinkSent]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setLoginError('');

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
        } catch (error: any) {
            console.error('Login error:', error);
            setLoginError(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const handleMagicLink = async () => {
        if (!email) {
            setLoginError('Please enter your email address first.');
            return;
        }
        setLoginError('');
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
            setLoginError(err.message || 'Failed to send magic link');
        } finally {
            setMagicLinkLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setLoginError('Please enter your email address first.');
            return;
        }
        setLoginError('');
        setResetSent(false);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) throw error;
            setResetSent(true);
        } catch (err: any) {
            setLoginError(err.message || 'Failed to send reset email');
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

                {/* Login Form */}
                <form onSubmit={handleLogin} className="p-8 pt-6 space-y-5">
                    {/* Email field */}
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

                    {/* Password field */}
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
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1"
                        >
                            Forgot password?
                        </button>
                    </div>

                    {/* Reset password sent confirmation */}
                    {resetSent && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                            <p className="text-sm font-bold text-blue-800">Password reset email sent!</p>
                            <p className="text-xs text-blue-600 mt-1">Check your inbox for a link to reset your password.</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-[#42ab31] hover:bg-[#3d9c2e] text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                Sign In to Workspace <ArrowRight size={18} />
                            </>
                        )}
                    </button>

                    {loginError && (
                        <p className="text-sm text-red-500 text-center">{loginError}</p>
                    )}

                    {/* Magic link sent confirmation (not in iframe — storage partitioning prevents cross-tab sessions) */}
                    {!inIframe && magicLinkSent && (
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

                    {/* Magic link option — hidden in iframe (third-party storage partitioning) */}
                    {!inIframe && !magicLinkSent && (
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
