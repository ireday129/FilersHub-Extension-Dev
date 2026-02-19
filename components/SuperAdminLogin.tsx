import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldAlert, Loader2 } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';
import { supabase } from '../services/supabase';
import { FILERSHUB_LOGO_URL } from '../constants';

const SuperAdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'password' | 'magic'>('magic');
    const [magicSent, setMagicSent] = useState(false);

    const handlePasswordLogin = async (e: React.FormEvent) => {
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

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const redirectUrl = `${window.location.origin}/super-admin`;
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: redirectUrl },
            });

            if (error) throw error;
            setMagicSent(true);
        } catch (error: any) {
            console.error('Magic link error:', error);
            alert(error.message || 'Failed to send magic link');
        } finally {
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

                {magicSent ? (
                    <div className="p-8 text-center space-y-3">
                        <Mail className="w-10 h-10 text-rose-600 mx-auto" />
                        <h2 className="text-lg font-bold text-slate-800">Check your email</h2>
                        <p className="text-sm text-slate-500">
                            We sent a secure login link to <span className="font-semibold text-slate-700">{email}</span>
                        </p>
                        <button
                            onClick={() => { setMagicSent(false); setEmail(''); }}
                            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 mt-2"
                        >
                            Use a different email
                        </button>
                    </div>
                ) : (
                    <form onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink} className="p-8 pt-6 space-y-5">
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

                        {mode === 'password' && (
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
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-300 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {mode === 'password' ? 'Authenticate' : 'Send Magic Link'} <ArrowRight size={18} />
                                </>
                            )}
                        </button>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
                                className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                            >
                                {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
                            </button>
                        </div>
                    </form>
                )}

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
