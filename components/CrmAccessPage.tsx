import React, { useState, useEffect } from 'react';
import { Loader2, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, ShieldX } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { FILERSHUB_LOGO_URL } from '../constants';

type AutoLoginStatus = 'idle' | 'loading' | 'success' | 'error';

const CrmAccessPage: React.FC = () => {
    const [autoLoginStatus, setAutoLoginStatus] = useState<AutoLoginStatus>('idle');
    const [autoLoginError, setAutoLoginError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [showPasswordFallback, setShowPasswordFallback] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [resetSent, setResetSent] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const locationId = params.get('location_id');
        const emailParam = params.get('email');

        if (!locationId || !emailParam) {
            setShowPasswordFallback(true);
            return;
        }

        setEmail(emailParam);
        attemptAutoLogin(locationId, emailParam);
    }, []);

    const attemptAutoLogin = async (locationId: string, userEmail: string) => {
        setAutoLoginStatus('loading');
        try {
            const response = await fetch('/api/crm-auto-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, email: userEmail }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 403 && (data.code === 'LOCATION_NOT_FOUND' || data.code === 'STAFF_NOT_FOUND')) {
                    setAccessDenied(true);
                    setAutoLoginStatus('error');
                    return;
                }
                throw new Error(data.error || 'Auto-login failed');
            }

            const { error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: data.token_hash,
                type: 'magiclink',
            });

            if (verifyError) {
                throw new Error(verifyError.message);
            }

            setAutoLoginStatus('success');
        } catch (err: any) {
            console.error('CRM auto-login failed:', err);
            setAutoLoginStatus('error');
            setAutoLoginError(err.message || 'Automatic sign-in failed');
            setShowPasswordFallback(true);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setLoginError('');
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (error: any) {
            setLoginError(error.message || 'Failed to sign in');
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setLoginError('Please enter your email address first.');
            return;
        }
        setLoginError('');
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

    // Access denied — location not installed or staff not found
    if (accessDenied) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
                <ShieldX className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">Access denied</p>
            </div>
        );
    }

    // Loading state during auto-login
    if (autoLoginStatus === 'loading' || autoLoginStatus === 'success') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <WatermarkBackground />
                <div className="relative z-10 text-center">
                    <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#42ab31' }} />
                    <p className="text-sm text-slate-500 font-medium">
                        {autoLoginStatus === 'loading' ? 'Signing you in...' : 'Loading your workspace...'}
                    </p>
                </div>
            </div>
        );
    }

    // Password fallback form
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <WatermarkBackground />
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative z-10">
                {/* Header */}
                <div className="p-8 pb-6 text-center border-b border-slate-50">
                    <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <h1 className="text-xl font-bold text-slate-800 flex items-center justify-center gap-2">
                        <ShieldCheck className="text-indigo-600" size={20} />
                        CRM Access
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Sign in to access your FilersHub workspace.
                    </p>
                </div>

                {/* Auto-login error banner */}
                {autoLoginError && (
                    <div className="mx-8 mt-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                        <AlertCircle className="text-amber-600 shrink-0" size={18} />
                        <div>
                            <p className="text-xs font-bold text-amber-800">Automatic sign-in unavailable</p>
                            <p className="text-xs text-amber-600">Please sign in with your password below.</p>
                        </div>
                    </div>
                )}

                {/* Password Login Form */}
                <form onSubmit={handlePasswordLogin} className="p-8 pt-6 space-y-5">
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

                    {resetSent && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                            <p className="text-sm font-bold text-blue-800">Password reset email sent!</p>
                            <p className="text-xs text-blue-600 mt-1">Check your inbox for a reset link.</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        style={{ background: '#42ab31' }}
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
                </form>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                    <p className="text-xs text-slate-400">Protected by FilersHub Enterprise Security</p>
                </div>
            </div>
        </div>
    );
};

export default CrmAccessPage;
