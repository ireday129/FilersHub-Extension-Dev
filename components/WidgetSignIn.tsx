import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '../services/supabase';

// Compact sign-in form shown inside the GHL widget when no FilersHub session exists.
const WidgetSignIn: React.FC<{ defaultEmail?: string; subtitle?: string }> = ({
    defaultEmail = '',
    subtitle = 'Sign in once to see your dashboard here.',
}) => {
    const [email, setEmail] = useState(defaultEmail);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
            setMessage(error.message);
            setBusy(false);
            return;
        }
        window.location.reload();
    };

    const handleForgotPassword = async () => {
        if (!email.trim()) {
            setMessage('Enter your email first.');
            return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        setMessage(error ? error.message : 'Check your email for a link to set your password.');
    };

    return (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-6 text-center">
            <Lock className="w-10 h-10 text-slate-300 mb-3" />
            <h2 className="text-base font-semibold text-slate-800">Sign in to FilersHub</h2>
            <p className="text-sm text-slate-500 mb-4">{subtitle}</p>
            <form onSubmit={handleSignIn} className="w-full max-w-xs space-y-2 text-left">
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Sign in
                </button>
                <button type="button" onClick={handleForgotPassword} className="w-full text-xs text-blue-600 hover:underline">
                    Forgot or never set a password?
                </button>
                {message && <p className="text-xs text-slate-600 text-center">{message}</p>}
            </form>
        </div>
    );
};

export default WidgetSignIn;
