import React, { useState, useEffect } from 'react';
import { Loader2, ShieldX, CheckCircle, Circle, Calendar, Sparkles, Play, Rocket, Youtube, MessageCircle, X } from 'lucide-react';
import WidgetSupportTickets from './WidgetSupportTickets';

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

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  link: string;
  isPro?: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'firm_profile', label: 'Set Up Firm Profile & Logo', description: 'Add your firm name, address, logo, and contact info', link: 'https://app.filershub.com/settings/firm-profile' },
  { id: 'brand_color', label: 'Configure Brand Color', description: 'Set the brand color that syncs to your CRM location', link: 'https://app.filershub.com/settings/firm-profile' },
  { id: 'portal_message', label: 'Set Portal Welcome Message', description: 'Customize the greeting your clients see when they log in', link: 'https://app.filershub.com/settings/firm-profile' },
  { id: 'portal_url', label: 'Verify Your Portal URL', description: 'Confirm your client portal link is correct and shareable', link: 'https://app.filershub.com/settings/firm-profile' },
  { id: 'staff_access', label: 'Grant CRM Staff Access', description: 'Assign Tax Pro or Manager roles to your CRM team members', link: 'https://app.filershub.com/settings/staff' },
  { id: 'first_client', label: 'Add Your First Client', description: 'Create a client record with name, email, and phone', link: 'https://app.filershub.com/clients' },
  { id: 'portal_invite', label: 'Send a Client Portal Invite', description: 'Invite a client so they can access their branded portal', link: 'https://app.filershub.com/clients' },
  { id: 'chrome_extension', label: 'Install the Chrome Extension', description: 'Access FilersHub directly from your CRM sidebar with one click', link: 'https://chromewebstore.google.com/detail/filershub' },
  { id: 'schedule_walkthrough', label: 'Schedule 1 on 1 Walkthrough Call', description: 'Get a personalized tour of FilersHub', link: 'https://app.filershub.com/support', isPro: true },
  { id: 'setup_irs_alerts', label: 'Set Up IRS Alerts', description: 'Monitor client transcripts for important updates', link: 'https://app.filershub.com/settings/alerts', isPro: true },
];

function formatRelativeDate(isoDate: string): string {
  const now = new Date();
  const d = new Date(isoDate);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PlatformUpdate {
  id: string;
  type: 'update' | 'deadline';
  title: string;
  body: string;
  date: string;
  isPro?: boolean;
}

const WIDGET_KEYFRAMES = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes floatA { 0%, 100% { transform: translateY(0) rotate(-15deg); } 50% { transform: translateY(-12px) rotate(-11deg); } }
@keyframes floatB { 0%, 100% { transform: translateY(0) rotate(12deg); } 50% { transform: translateY(-14px) rotate(16deg); } }
@keyframes floatC { 0%, 100% { transform: translateY(0) rotate(-25deg); } 50% { transform: translateY(-9px) rotate(-20deg); } }
@keyframes floatD { 0%, 100% { transform: translateY(0) rotate(8deg); } 50% { transform: translateY(-11px) rotate(13deg); } }
@keyframes floatE { 0%, 100% { transform: translateY(0) rotate(-40deg); } 50% { transform: translateY(-10px) rotate(-35deg); } }
`;


const LAUNCH_DATE = new Date('2026-04-15T00:00:00');
const isPreLaunch = new Date() < LAUNCH_DATE;

const GhlWidget: React.FC = () => {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [showSupport, setShowSupport] = useState(false);
  const [isPro, setIsPro] = useState(false);
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load data');
        setAuthorized(true);
        if (data.subscriptionTier && data.subscriptionTier.toLowerCase().includes('pro')) {
          setIsPro(true);
        }
        if (data.platformUpdates) {
          setUpdates(data.platformUpdates.map((u: any) => ({
            id: u.id,
            type: u.type,
            title: u.title,
            body: u.body,
            date: formatRelativeDate(u.date),
            isPro: u.isPro,
          })));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleArchiveUpdate = async (updateId: string) => {
    // Optimistic UI update
    setUpdates(prev => prev.filter(u => u.id !== updateId));

    const params = new URLSearchParams(window.location.search);
    const locationId = params.get('location_id');
    const email = params.get('email');

    if (!locationId || !email) return;

    try {
      await fetch('/api/widget-archive-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, email, updateId }),
      });
    } catch (err) {
      console.error('Failed to archive update:', err);
    }
  };

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

  if (error || !authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <ShieldX className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">Access denied</p>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold text-slate-800">
            Welcome to FilersHub
            <Sparkles className="inline w-3.5 h-3.5 align-super ml-px mr-0.5" style={{ color: FH_ORANGE }} />
            {' '}Launchpad
          </h1>
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
            {isPreLaunch && (
              <div className="px-4 pb-2">
                <p className="text-xs text-slate-400 italic">Available after launch day</p>
              </div>
            )}
            <div className="divide-y divide-slate-100" style={isPreLaunch ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
              {ONBOARDING_STEPS.map((step) => {
                const done = completedSteps.has(step.id);
                const disabled = step.isPro && !isPro;
                return (
                  <div key={step.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`} onClick={() => { if (!disabled) toggleStep(step.id); }}>
                    <div className="pt-0.5 shrink-0">
                      {done
                        ? <CheckCircle className="w-[22px] h-[22px]" style={{ color: FH_GREEN }} fill={FH_GREEN} stroke="white" />
                        : <Circle className={`w-[22px] h-[22px] ${disabled ? 'text-slate-200' : 'text-slate-300'}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : disabled ? 'text-slate-400' : 'text-slate-800'}`}>{step.label}</p>
                        {step.isPro && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-white tracking-wide">Pro</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${disabled ? 'text-slate-300' : 'text-slate-400'}`}>{step.description}</p>
                    </div>
                    {!done && !disabled && (
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 mb-2">
                <Play className="w-4 h-4" />
                <h2 className="text-sm font-semibold text-slate-800">Getting Started with FilersHub</h2>
              </div>
              <a
                href="https://www.youtube.com/@Filers_Hub"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                style={{ color: FH_ORANGE }}
              >
                <Youtube className="w-[18px] h-[18px]" /> All Videos
              </a>
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

        {/* Important Updates */}
        <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ ...card, ...fadeIn(3) }}>
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Important Updates</h2>
          {updates.length > 0 ? (
            <div className="space-y-3">
              {updates.map((item) => (
                <div key={item.id} className="flex items-start gap-3 relative group">
                  {item.type === 'deadline'
                    ? <Calendar className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    : <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: FH_ORANGE }} />
                  }
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      {item.isPro && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-white tracking-wide">Pro Exclusive</span>
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.type === 'deadline' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                        {item.date}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{item.body}</p>
                  </div>
                  <button
                    onClick={() => handleArchiveUpdate(item.id)}
                    className="absolute top-0 right-0 p-1 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Archive this update"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No updates at this time. Check back soon!</p>
          )}
        </div>

        {/* Tutorials Link */}
        <a
          href={`/tutorials?${new URLSearchParams(window.location.search).toString()}`}
          className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-green-300 transition-colors"
          style={{ ...card, ...fadeIn(3.5), textDecoration: 'none' }}
        >
          <Play className="w-5 h-5 shrink-0" style={{ color: FH_GREEN }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Tutorials & Training</p>
            <p className="text-xs text-slate-500">Watch step-by-step guides to get the most out of FilersHub</p>
          </div>
          <Rocket className="w-4 h-4 text-slate-300 shrink-0" />
        </a>

        {/* Support */}
        <div className="flex justify-center pt-2 pb-4" style={{ ...card, ...fadeIn(4) }}>
          <button
            onClick={() => setShowSupport(true)}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:border-green-300 transition-colors"
            style={{ color: FH_GREEN }}
          >
            <MessageCircle className="w-4 h-4" />
            Support Center
          </button>
        </div>

        {/* Support Tickets Overlay */}
        {showSupport && (
          <WidgetSupportTickets
            locationId={new URLSearchParams(window.location.search).get('location_id') || ''}
            email={new URLSearchParams(window.location.search).get('email') || ''}
            onClose={() => setShowSupport(false)}
          />
        )}
      </div>
    </div>
  );
};

export default GhlWidget;
