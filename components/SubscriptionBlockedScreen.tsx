import React from 'react';
import { ShieldX, LogOut } from 'lucide-react';
import { FILERSHUB_LOGO_URL } from '../constants';
import { useAuth } from '../contexts/AuthContext';

const SubscriptionBlockedScreen: React.FC = () => {
    const { signOut } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="max-w-md w-full text-center">
                <img
                    src={FILERSHUB_LOGO_URL}
                    alt="FilersHub"
                    className="h-12 mx-auto mb-8"
                />

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldX className="w-7 h-7 text-rose-600" />
                    </div>

                    <h1 className="text-xl font-bold text-slate-800 mb-2">
                        Subscription Inactive
                    </h1>

                    <p className="text-sm text-slate-500 mb-6">
                        Your subscription has expired or been canceled. Please renew your subscription to continue using FilersHub.
                    </p>

                    <a
                        href="mailto:support@filershub.com"
                        className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        Contact Support
                    </a>

                    <button
                        onClick={() => signOut()}
                        className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 text-slate-500 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionBlockedScreen;
