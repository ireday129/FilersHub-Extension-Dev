import React, { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Loader2, ShieldX, CheckCircle, Circle, Calendar, Sparkles, Mail, Play } from 'lucide-react';

const FH_GREEN = '#42ab30';
const FH_ORANGE = '#f69109';

const LOGO_URL = 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png';
const WELCOME_VIDEO_ID = 'dQw4w9WgXcQ';

const FLOATERS = [
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c6753b3cc9e7ef06603a.png', style: { top: 40, left: -60, width: 480 }, anim: 'floatA 5s ease-in-out infinite' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948cd064c0d134d507dede.png', style: { top: 10, right: -50, width: 560 }, anim: 'floatB 6s ease-in-out infinite 0.5s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c7b78ef1b9174835d5e6.png', style: { top: '45%', left: -20, width: 240 }, anim: 'floatC 4.5s ease-in-out infinite 1s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d27d614c99d54f2a8db.png', style: { top: '55%', right: -20, width: 360 }, anim: 'floatD 5.5s ease-in-out infinite 0.3s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d63d614c96431f2b40f.png', style: { bottom: 60, left: -10, width: 320 }, anim: 'floatE 5s ease-in-out infinite 0.8s' },
];

const ONBOARDING_STEPS = [
  { id: 'firm_profile', label: 'Set Up Firm Profile & Logo', description: 'Add your firm name, address, logo, and contact info', link: 'https://app.filershub.com/settings/firm-profile' },
];

const ANNOUNCEMENTS = [
  { id: '1', type: 'deadline' as const, title: 'Tax Season Deadline', body: 'April 15, 2026 — Individual filing deadline. Extensions must be filed by this date.', date: 'Upcoming' },
  { id: '2', type: 'update' as const, title: 'Welcome to FilersHub Pro!', body: 'Complete your onboarding checklist above to get started. Need help? Reach out anytime.', date: 'Today' },
];

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

const WIDGET_KEYFRAMES = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes floatA { 0%, 100% { transform: translateY(0) rotate(-15deg); } 50% { transform: translateY(-12px) rotate(-11deg); } }
@keyframes floatB { 0%, 100% { transform: translateY(0) rotate(12deg); } 50% { transform: translateY(-14px) rotate(16deg); } }
@keyframes floatC { 0%, 100% { transform: translateY(0) rotate(-25deg); } 50% { transform: translateY(-9px) rotate(-20deg); } }
@keyframes floatD { 0%, 100% { transform: translateY(0) rotate(8deg); } 50% { transform: translateY(-11px) rotate(13deg); } }
@keyframes floatE { 0%, 100% { transform: translateY(0) rotate(-40deg); } 50% { transform: translateY(-10px) rotate(-35deg); } }
`;

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
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

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

  // Inject keyframe animations
  useEffect(() => {
    const styleId = 'ghl-widget-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = WIDGET_KEYFRAMES;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

  const toggleStep = (id: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: FH_GREEN }} />
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

  const { stats } = data;
  const activeReturns = stats.totalReturns - (stats.returnsByStatus['Filed'] || 0) - (stats.returnsByStatus['Accepted'] || 0) - (stats.returnsByStatus['Rejected'] || 0);

  const completedCount = completedSteps.size;
  const totalSteps = ONBOARDING_STEPS.length;
  const allDone = completedCount === totalSteps;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const fadeIn = (delay: number): React.CSSProperties => ({
    animation: `fadeIn 0.4s ease-out ${delay * 0.08}s forwards`,
    opacity: 0,
  });

  const card: React.CSSProperties = { position: 'relative', zIndex: 2 };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-8 overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Floating background images */}
      {FLOATERS.map((f, i) => (
        <img
          key={i}
          src={f.src}
          alt=""
          style={{ position: 'fixed', pointerEvents: 'none', zIndex: 0, animation: f.anim, ...f.style }}
        />
      ))}

      <div className="max-w-2xl mx-auto space-y-4" style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div className="text-center pt-2 pb-2" style={{ animation: 'fadeIn 0.4s ease-out forwards' }}>
          <img src={LOGO_URL} alt="FilersHub" className="h-9 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800">Welcome to the FilersHub Pro Launchpad</h1>
          <p className="text-sm text-slate-500 mt-1">Your tax practice command center</p>
        </div>

        {/* Onboarding Checklist */}
        {!allDone && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ ...card, ...fadeIn(1) }}>
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-800">Getting Started</h2>
                <span className="text-xs text-slate-400">{completedCount}/{totalSteps} complete</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${FH_GREEN}, ${FH_ORANGE})` }}
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {ONBOARDING_STEPS.map((step) => {
                const done = completedSteps.has(step.id);
                return (
                  <div key={step.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => toggleStep(step.id)}>
                    <div className="pt-0.5 shrink-0">
                      {done
                        ? <CheckCircle className="w-[22px] h-[22px]" style={{ color: FH_GREEN }} fill={FH_GREEN} stroke="white" />
                        : <Circle className="w-[22px] h-[22px] text-slate-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{step.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                    </div>
                    {!done && (
                      <a href={step.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-white px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-90" style={{ background: FH_GREEN }} onClick={(e) => e.stopPropagation()}>Start</a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Welcome Video */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ ...card, ...fadeIn(2) }}>
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4" />
              <h2 className="text-sm font-semibold text-slate-800">Getting Started with FilersHub</h2>
            </div>
          </div>
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://www.youtube.com/embed/${WELCOME_VIDEO_ID}?rel=0`}
              title="Welcome to FilersHub"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        {/* Scorecards */}
        <div className="grid grid-cols-3 gap-3" style={fadeIn(3)}>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center" style={card}>
            <Users className="w-5 h-5 mx-auto mb-1" style={{ color: FH_GREEN }} />
            <p className="text-2xl font-bold text-slate-800">{stats.totalClients}</p>
            <p className="text-xs text-slate-500">Total Clients</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center" style={card}>
            <FileText className="w-5 h-5 mx-auto mb-1" style={{ color: FH_GREEN }} />
            <p className="text-2xl font-bold text-slate-800">{stats.totalReturns}</p>
            <p className="text-xs text-slate-500">Total Returns</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center" style={card}>
            <TrendingUp className="w-5 h-5 mx-auto mb-1" style={{ color: FH_ORANGE }} />
            <p className="text-2xl font-bold text-slate-800">{activeReturns}</p>
            <p className="text-xs text-slate-500">Active Returns</p>
          </div>
        </div>

        {/* Returns by Status */}
        <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ ...card, ...fadeIn(4) }}>
          <h2 className="text-sm font-medium text-slate-700 mb-3">Returns by Status</h2>
          {Object.keys(stats.returnsByStatus).length === 0 ? (
            <p className="text-xs text-slate-400">No returns yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((status) => {
                const count = stats.returnsByStatus[status];
                if (!count) return null;
                const colorClass = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
                return (
                  <span key={status} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                    {status} <span className="font-bold">{count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Announcements & Deadlines */}
        <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ ...card, ...fadeIn(5) }}>
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Announcements & Deadlines</h2>
          <div className="space-y-3">
            {ANNOUNCEMENTS.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                {item.type === 'deadline'
                  ? <Calendar className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  : <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: FH_ORANGE }} />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{item.title}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.type === 'deadline' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                      {item.date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Support */}
        <div className="flex items-center justify-center gap-2 pt-2 pb-4" style={{ ...card, ...fadeIn(6) }}>
          <Mail className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">
            Need help?{' '}
            <a href="mailto:support@filershub.com" className="font-medium underline underline-offset-2" style={{ color: FH_GREEN }}>
              support@filershub.com
            </a>
          </span>
        </div>
      </div>
    </div>
  );
};

export default GhlWidget;
