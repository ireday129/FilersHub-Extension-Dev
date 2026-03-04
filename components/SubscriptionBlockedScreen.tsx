import React, { useState } from 'react';
import { ShieldX, Lock, LogOut, Mail, Loader2, CheckCircle } from 'lucide-react';
import { FILERSHUB_LOGO_URL } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

interface Props {
    reason: 'no_subscription' | 'canceled';
    firmId?: string | null;
}

const SubscriptionBlockedScreen: React.FC<Props> = ({ reason, firmId }) => {
    const { signOut } = useAuth();
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [email, setEmail] = useState('');
    const [linking, setLinking] = useState(false);
    const [linkResult, setLinkResult] = useState<{ success: boolean; message: string } | null>(null);

    const isNoSub = reason === 'no_subscription';

    const handleLinkSubscription = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !firmId) return;

        setLinking(true);
        setLinkResult(null);

        try {
            const { data, error } = await supabase.functions.invoke('crm-auth', {
                body: { action: 'claim-subscription', email: email.trim(), firmId }
            });

            if (error) {
                setLinkResult({ success: false, message: 'Failed to check subscription. Please try again.' });
                return;
            }

            if (data?.linked) {
                setLinkResult({ success: true, message: `Subscription linked! Tier: ${data.subscription_tier}` });
                setTimeout(() => window.location.reload(), 1500);
            } else {
                setLinkResult({ success: false, message: data?.message || 'No subscription found for this email.' });
            }
        } catch (err: any) {
            setLinkResult({ success: false, message: err?.message || 'An error occurred.' });
        } finally {
            setLinking(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="max-w-md w-full text-center">
                <img
                    src={FILERSHUB_LOGO_URL}
                    alt="FilersHub"
                    className="h-12 mx-auto mb-8"
                />

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isNoSub ? 'bg-blue-100' : 'bg-rose-100'}`}>
                        {isNoSub
                            ? <Lock className="w-7 h-7 text-blue-600" />
                            : <ShieldX className="w-7 h-7 text-rose-600" />
                        }
                    </div>

                    <h1 className="text-xl font-bold text-slate-800 mb-2">
                        {isNoSub ? 'Subscription Required' : 'Subscription Inactive'}
                    </h1>

                    <p className="text-sm text-slate-500 mb-6">
                        {isNoSub
                            ? 'An active subscription is required to access FilersHub. Please purchase a plan to unlock your account.'
                            : 'Your subscription has expired or been canceled. Please renew your subscription to continue using FilersHub.'
                        }
                    </p>

                    <a
                        href="mailto:support@filershub.com"
                        className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        {isNoSub ? 'Get a Subscription' : 'Contact Support'}
                    </a>

                    <button
                        onClick={() => signOut()}
                        className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 text-slate-500 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>

                    {/* Link existing subscription */}
                    {firmId && (
                        <div className="mt-6 pt-6 border-t border-slate-200">
                            {!showLinkForm ? (
                                <button
                                    onClick={() => setShowLinkForm(true)}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    Already purchased? Link your subscription
                                </button>
                            ) : (
                                <form onSubmit={handleLinkSubscription} className="space-y-3">
                                    <p className="text-xs text-slate-500">
                                        Enter the email you used to purchase your subscription
                                    </p>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="purchase@email.com"
                                            required
                                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={linking || !email.trim()}
                                        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                    >
                                        {linking ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Linking...
                                            </>
                                        ) : (
                                            'Link Subscription'
                                        )}
                                    </button>

                                    {linkResult && (
                                        <div className={`flex items-center gap-2 text-sm p-3 rounded-xl ${
                                            linkResult.success
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-rose-50 text-rose-700'
                                        }`}>
                                            {linkResult.success && <CheckCircle size={16} />}
                                            {linkResult.message}
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SubscriptionBlockedScreen;
