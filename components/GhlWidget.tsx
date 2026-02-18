import React, { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Loader2, ShieldX, ExternalLink } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  'Intake Received': 'bg-blue-100 text-blue-700',
  'Compliance Review': 'bg-purple-100 text-purple-700',
  'In Preparation': 'bg-amber-100 text-amber-700',
  'Missing Documents': 'bg-red-100 text-red-700',
  'Ready for Signature': 'bg-teal-100 text-teal-700',
  'Invoice Sent': 'bg-emerald-100 text-emerald-700',
  'Bank Product': 'bg-indigo-100 text-indigo-700',
  'Filed': 'bg-green-100 text-green-700',
  'Rejected': 'bg-rose-100 text-rose-700',
  'Accepted': 'bg-sky-100 text-sky-700',
};

const STATUS_ORDER = [
  'Intake Received', 'Compliance Review', 'In Preparation', 'Missing Documents',
  'Ready for Signature', 'Invoice Sent', 'Bank Product', 'Filed', 'Rejected', 'Accepted',
];

interface WidgetData {
  firmName: string;
  stats: {
    totalClients: number;
    totalReturns: number;
    returnsByStatus: Record<string, number>;
  };
}

const GhlWidget: React.FC = () => {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get('location_id');
    const email = params.get('email');

    if (!locationId || !email) {
      setError('Missing required parameters');
      setLoading(false);
      return;
    }

    fetch('/api/widget-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, email }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load data');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <ShieldX className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">Access denied</p>
      </div>
    );
  }

  if (!data) return null;

  const { firmName, stats } = data;
  const activeReturns = stats.totalReturns - (stats.returnsByStatus['Filed'] || 0) - (stats.returnsByStatus['Accepted'] || 0) - (stats.returnsByStatus['Rejected'] || 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">{firmName}</h1>
          <a
            href="https://app.filershub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
          >
            Open FilersHub <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Scorecards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <Users className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-slate-800">{stats.totalClients}</p>
            <p className="text-xs text-slate-500">Total Clients</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <FileText className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-slate-800">{stats.totalReturns}</p>
            <p className="text-xs text-slate-500">Total Returns</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <TrendingUp className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-slate-800">{activeReturns}</p>
            <p className="text-xs text-slate-500">Active Returns</p>
          </div>
        </div>

        {/* Returns by Status */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-700 mb-3">Returns by Status</h2>
          <div className="flex flex-wrap gap-2">
            {STATUS_ORDER.map((status) => {
              const count = stats.returnsByStatus[status];
              if (!count) return null;
              const colorClass = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
              return (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}
                >
                  {status}
                  <span className="font-bold">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GhlWidget;
