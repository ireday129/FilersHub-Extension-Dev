import React from 'react';
import { CheckCircle, LogOut, Calendar } from 'lucide-react';
import { FILERSHUB_LOGO_URL } from '../constants';
import { useAuth } from '../contexts/AuthContext';

const PreLaunchScreen: React.FC = () => {
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
                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-7 h-7 text-emerald-600" />
                    </div>

                    <h1 className="text-xl font-bold text-slate-800 mb-2">
                        App Successfully Installed
                    </h1>

                    <p className="text-sm text-slate-500 mb-6">
                        Thank you for installing FilersHub! Your account has been set up and is ready to go.
                    </p>

                    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 rounded-xl mb-6">
                        <Calendar size={16} className="text-blue-600" />
                        <p className="text-sm font-semibold text-blue-700">
                            Available for use on April 15, 2026
                        </p>
                    </div>

                    <p className="text-xs text-slate-400 mb-6">
                        We'll notify you when the app is live. No further action is needed on your end.
                    </p>

                    <button
                        onClick={() => signOut()}
                        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 text-slate-500 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>

                <p className="mt-6 text-xs text-slate-400">
                    Need help? Contact <a href="mailto:support@filershub.com" className="text-blue-500 hover:underline font-medium">support@filershub.com</a>
                </p>
            </div>
        </div>
    );
};

export default PreLaunchScreen;
