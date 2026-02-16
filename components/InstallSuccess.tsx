import React from 'react';
import { CheckCircle, RefreshCw, X } from 'lucide-react';
import { WatermarkBackground } from './WatermarkBackground';

const InstallSuccess: React.FC = () => {
    const logoUrl = "https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png";

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <WatermarkBackground />
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative z-10">
                {/* Header */}
                <div className="p-8 pb-6 text-center border-b border-slate-50">
                    <img src={logoUrl} alt="FilersHub" className="h-10 mx-auto mb-6" />
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-[#42ab31]" size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">
                        Installation Successful
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        FilersHub has been installed to your CRM.
                    </p>
                </div>

                {/* Steps */}
                <div className="p-8 pt-6 space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="w-8 h-8 bg-[#42ab31]/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                            <X className="text-[#42ab31]" size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">Close this window</p>
                            <p className="text-xs text-slate-500 mt-0.5">You can safely close this tab now.</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="w-8 h-8 bg-[#42ab31]/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                            <RefreshCw className="text-[#42ab31]" size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">Refresh your CRM</p>
                            <p className="text-xs text-slate-500 mt-0.5">Go back to your CRM and refresh the page. Your FilersHub dashboard will appear in the sidebar.</p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                        Need help? Contact support at <a href="mailto:support@filershub.com" className="text-[#42ab31] hover:underline font-medium">support@filershub.com</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default InstallSuccess;
