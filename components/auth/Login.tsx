import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface LoginProps {
    firmBranding?: {
        name: string;
        logo: string;
        color: string;
    };
}

const Login: React.FC<LoginProps> = ({ firmBranding }) => {
    const { bypassAuth } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSignUp, setIsSignUp] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    const brandColor = firmBranding?.color || '#2563eb'; // Default blue-600
    // Helper for hover state - simple approach, or just use opacity
    const brandName = firmBranding?.name || 'FilersHub';

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                alert('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMagicLink = async () => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOtp({ email });
            if (error) throw error;
            setMagicLinkSent(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-slate-100">
                <div className="text-center mb-8 flex flex-col items-center">
                    {firmBranding?.logo ? (
                        <div className="w-24 h-24 mb-4 flex items-center justify-center">
                            <img src={firmBranding.logo} alt={brandName} className="max-w-full max-h-full object-contain" />
                        </div>
                    ) : (
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">{brandName}</h1>
                    )}
                    {!firmBranding?.logo && <p className="text-slate-500 mt-0">Sign in to your account</p>}
                    {firmBranding?.logo && <h1 className="text-xl font-bold text-slate-800">{brandName} Portal</h1>}
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}

                {magicLinkSent ? (
                    <div className="bg-green-50 text-green-700 p-4 rounded-lg text-center">
                        <h3 className="font-bold mb-2">Check your email</h3>
                        <p className="text-sm">We sent a magic link to {email}</p>
                        <button
                            onClick={() => setMagicLinkSent(false)}
                            className="mt-4 text-green-700 underline text-sm"
                        >
                            Try another method
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="you@email.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="flex justify-end mb-4">
                            <button
                                type="button"
                                onClick={bypassAuth}
                                className="text-xs text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1"
                            >
                                <ShieldCheck size={12} />
                                Skip Login (Dev Mode)
                            </button>
                        </div>


                        <button
                            type="submit"
                            disabled={loading}
                            style={{ backgroundColor: brandColor }}
                            className="w-full text-white font-medium py-2.5 rounded-lg transition-all hover:opacity-90 flex items-center justify-center gap-2 shadow-sm"
                        >
                            {loading && <Loader2 size={18} className="animate-spin" />}
                            {isSignUp ? 'Create Account' : 'Sign In'}
                        </button>

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-200"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-slate-500">Or continue with</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleMagicLink}
                            disabled={loading || !email}
                            className="w-full bg-white border border-slate-300 text-slate-700 font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Send Magic Link
                        </button>

                        <div className="mt-4 text-center text-sm">
                            <button
                                type="button"
                                onClick={() => setIsSignUp(!isSignUp)}
                                style={{ color: brandColor }}
                                className="font-medium hover:underline"
                            >
                                {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Login;
