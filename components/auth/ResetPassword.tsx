import React, { useState } from 'react';
import { Lock, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { WatermarkBackground } from '../WatermarkBackground';
import { supabase } from '../../services/supabase';
import { FILERSHUB_LOGO_URL } from '../../constants';

const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setSuccess(true);
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to update password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <WatermarkBackground />
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative z-10">
                <div className="p-8 pb-6 text-center border-b border-slate-50">
                    <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <h1 className="text-xl font-bold text-slate-800 flex items-center justify-center gap-2">
                        <ShieldCheck className="text-indigo-600" size={20} />
                        Reset Password
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Enter your new password below.
                    </p>
                </div>

                {success ? (
                    <div className="p-8 text-center space-y-3">
                        <CheckCircle2 className="text-emerald-600 mx-auto" size={32} />
                        <p className="text-sm font-bold text-emerald-800">Password updated successfully!</p>
                        <p className="text-xs text-slate-500">Redirecting to dashboard...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-8 pt-6 space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">New Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Confirm Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="text-sm text-red-500 text-center">{error}</p>
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
                                    Update Password <ArrowRight size={18} />
                                </>
                            )}
                        </button>
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

export default ResetPassword;
