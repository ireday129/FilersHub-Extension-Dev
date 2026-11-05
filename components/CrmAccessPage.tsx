import React, { useState, useEffect } from 'react';
import { widgetAuthHeaders } from '../services/widgetAuth';
import { Loader2, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, ShieldX } from 'lucide-react';
import { crmAccessOutcome } from '../services/crmAccess';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { FILERSHUB_LOGO_URL } from '../constants';


interface CrmAccessPageProps {
    isAuthenticated?: boolean;
    onValidated?: (firmId: string) => void;
}

type Denied = { reason: 'location' | 'staff' | 'error' };

const DENIED_TEXT: Record<Denied['reason'], { title: string; body: string }> = {
    location: {
        title: 'This sub-account isn’t set up in FilersHub',
        body: 'This GHL sub-account isn’t linked to a FilersHub firm yet. The firm owner can connect it in FilersHub Settings.',
    },
    staff: {
        title: 'No access to this firm',
        body: 'The FilersHub account you’re signed in with isn’t staff of the firm that owns this GHL sub-account.',
    },
    error: {
        title: 'Couldn’t check your access',
        body: 'Something went wrong while checking your access. Try again in a moment.',
    },
};

const CrmAccessPage: React.FC<CrmAccessPageProps> = ({ isAuthenticated, onValidated }) => {
    const [checking, setChecking] = useState(false);
    const [denied, setDenied] = useState<Denied | null>(null);
    const [signedInEmail, setSignedInEmail] = useState('');
    const [notice, setNotice] = useState('');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [resetSent, setResetSent] = useState(false);

    // Runs on open and again after signing in with the form below (the page stays mounted).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const locationId = params.get('location_id');
        const emailParam = params.get('email');
        if (emailParam) setEmail((current) => current || emailParam);

        if (!isAuthenticated) {
            setChecking(false);
            return;
        }
        if (!locationId) {
            setDenied({ reason: 'location' });
            return;
        }
        validateLocation(locationId);
    }, [isAuthenticated]);

    const validateLocation = async (locationId: string) => {
        setChecking(true);
        setDenied(null);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            setSignedInEmail(sessionData.session?.user?.email || '');

            const response = await fetch('/api/crm-validate-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await widgetAuthHeaders()) },
                body: JSON.stringify({ locationId }),
            });
            const data = await response.json().catch(() => ({}));
            const outcome = crmAccessOutcome(response.status, data?.code);

            if (outcome === 'ok' && data.firm_id) {
                onValidated?.(data.firm_id);
                return;
            }
            if (outcome === 'signin') {
                // Session expired or unreadable: start over with the sign-in form.
                await supabase.auth.signOut();
                setNotice('Your FilersHub session ended. Please sign in again.');
                setChecking(false);
                return;
            }
            setDenied({ reason: outcome === 'ok' ? 'error' : outcome });
        } catch (err: any) {
            console.error('CRM location validation failed:', err);
            setDenied({ reason: 'error' });
        }
        setChecking(false);
    };

    const switchAccount = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setLoginError('');
        setNotice('');
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            // The app re-renders this page as signed in, which runs the access check.
        } catch (error: any) {
            setLoginError(error.message || 'Failed to sign in');
        }
        setIsLoading(false);
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

    if (denied) {
        const text = DENIED_TEXT[denied.reason];
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <WatermarkBackground />
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-4 relative z-10">
                    <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-10 mx-auto" />
                    <ShieldX className="w-10 h-10 text-slate-300 mx-auto" />
                    <h1 className="text-lg font-bold text-slate-800">{text.title}</h1>
                    <p className="text-sm text-slate-500">{text.body}</p>
                    {signedInEmail && (
                        <p className="text-xs text-slate-500">
                            Signed in to FilersHub as <span className="font-semibold text-slate-700 break-all">{signedInEmail}</span>
                        </p>
                    )}
                    <div className="space-y-2 pt-2">
                        {denied.reason === 'error' && (
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
                            >
                                Try again
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={switchAccount}
                            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                            style={{ background: '#42ab31' }}
                        >
                            Sign in with a different account
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isAuthenticated || checking) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <WatermarkBackground />
                <div className="relative z-10 text-center">
                    <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#42ab31' }} />
                    <p className="text-sm text-slate-500 font-medium">Verifying access...</p>
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

                {notice && (
                    <div className="mx-8 mt-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                        <AlertCircle className="text-amber-600 shrink-0" size={18} />
                        <p className="text-xs font-semibold text-amber-800">{notice}</p>
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
