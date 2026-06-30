import React, { useState, useEffect } from 'react';
import { CheckCircle, LogOut, Calendar } from 'lucide-react';
import { FILERSHUB_LOGO_URL } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { WatermarkBackground } from './WatermarkBackground';

const LAUNCH_DATE = new Date('2026-08-01T00:00:00');

function getTimeRemaining() {
    const now = new Date().getTime();
    const diff = LAUNCH_DATE.getTime() - now;

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
    };
}

const PreLaunchScreen: React.FC = () => {
    const { signOut } = useAuth();
    const [time, setTime] = useState(getTimeRemaining);

    useEffect(() => {
        const interval = setInterval(() => setTime(getTimeRemaining()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <WatermarkBackground />
            <div className="max-w-md w-full text-center relative z-10">
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

                    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 rounded-xl mb-4">
                        <Calendar size={16} className="text-blue-600" />
                        <p className="text-sm font-semibold text-blue-700">
                            Available for use on April 15, 2026
                        </p>
                    </div>

                    {/* Countdown Timer */}
                    <div className="grid grid-cols-4 gap-2 mb-6">
                        {[
                            { value: time.days, label: 'Days' },
                            { value: time.hours, label: 'Hours' },
                            { value: time.minutes, label: 'Min' },
                            { value: time.seconds, label: 'Sec' },
                        ].map(({ value, label }) => (
                            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl py-3">
                                <p className="text-2xl font-black text-slate-800 tabular-nums">
                                    {String(value).padStart(2, '0')}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {label}
                                </p>
                            </div>
                        ))}
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
