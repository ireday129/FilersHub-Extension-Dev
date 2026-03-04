import React, { useState, useEffect } from 'react';
import { Loader2, Play, Lock, Mail, Zap, X } from 'lucide-react';

const FH_GREEN = '#42ab30';
const FH_ORANGE = '#f69109';

const LOGO_URL = 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png';

const FLOATERS = [
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c6753b3cc9e7ef06603a.png', style: { top: 40, left: -60, width: 480 }, anim: 'floatA 5s ease-in-out infinite' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948cd064c0d134d507dede.png', style: { top: 10, right: -50, width: 560 }, anim: 'floatB 6s ease-in-out infinite 0.5s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c7b78ef1b9174835d5e6.png', style: { top: '45%', left: -20, width: 240 }, anim: 'floatC 4.5s ease-in-out infinite 1s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d27d614c99d54f2a8db.png', style: { top: '55%', right: -20, width: 360 }, anim: 'floatD 5.5s ease-in-out infinite 0.3s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d63d614c96431f2b40f.png', style: { bottom: 60, left: -10, width: 320 }, anim: 'floatE 5s ease-in-out infinite 0.8s' },
];

const KEYFRAMES = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes floatA { 0%, 100% { transform: translateY(0) rotate(-15deg); } 50% { transform: translateY(-12px) rotate(-11deg); } }
@keyframes floatB { 0%, 100% { transform: translateY(0) rotate(12deg); } 50% { transform: translateY(-14px) rotate(16deg); } }
@keyframes floatC { 0%, 100% { transform: translateY(0) rotate(-25deg); } 50% { transform: translateY(-9px) rotate(-20deg); } }
@keyframes floatD { 0%, 100% { transform: translateY(0) rotate(8deg); } 50% { transform: translateY(-11px) rotate(13deg); } }
@keyframes floatE { 0%, 100% { transform: translateY(0) rotate(-40deg); } 50% { transform: translateY(-10px) rotate(-35deg); } }
`;

interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  duration: string;
}

// Placeholder YouTube ID until real videos are recorded
const PLACEHOLDER_ID = 'dQw4w9WgXcQ';

const GETTING_STARTED_VIDEOS: TutorialVideo[] = [
  { id: 'gs1', title: 'Welcome to FilersHub', description: 'Quick tour of the dashboard and key features', youtubeId: PLACEHOLDER_ID, duration: '2-3 min' },
  { id: 'gs2', title: 'Setting Up Your Firm Profile', description: 'Add firm name, logo, address, and contact info', youtubeId: PLACEHOLDER_ID, duration: '3-4 min' },
  { id: 'gs3', title: 'Configuring Brand Colors', description: 'Set your brand color that syncs to your CRM', youtubeId: PLACEHOLDER_ID, duration: '2 min' },
  { id: 'gs4', title: 'Adding Your First Client', description: 'Create a client record and walk through client fields', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
  { id: 'gs5', title: 'Sending a Client Portal Invite', description: 'How clients receive and access their portal', youtubeId: PLACEHOLDER_ID, duration: '2-3 min' },
  { id: 'gs6', title: 'Granting Staff Access', description: 'Add team members and assign Tax Pro or Manager roles', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
];

const PRACTICE_VIDEOS: TutorialVideo[] = [
  { id: 'pm1', title: 'Navigating the CRM Dashboard', description: 'Overview of stats, returns, and quick actions', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
  { id: 'pm2', title: 'Managing Tax Returns', description: 'Create, update status, and track returns through the workflow', youtubeId: PLACEHOLDER_ID, duration: '4-5 min' },
  { id: 'pm3', title: 'Client Portal Walkthrough', description: 'What your clients see when they log in', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
  { id: 'pm4', title: 'Using the GHL Widget', description: 'How the FilersHub widget works inside GoHighLevel', youtubeId: PLACEHOLDER_ID, duration: '2-3 min' },
  { id: 'pm5', title: 'Document Management', description: 'Upload, organize, and share files with clients', youtubeId: PLACEHOLDER_ID, duration: '3-4 min' },
  { id: 'pm6', title: 'Staff Permissions & Roles', description: 'Difference between Firm Owner, Manager, and Tax Pro', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
];

const PRO_VIDEOS: TutorialVideo[] = [
  { id: 'pro1', title: 'Pro Features Overview', description: 'Everything included in your Pro subscription', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
  { id: 'pro2', title: 'Advanced Reporting & Analytics', description: 'Deeper insights into firm performance', youtubeId: PLACEHOLDER_ID, duration: '4-5 min' },
  { id: 'pro3', title: 'Workflow Automations', description: 'Automated status updates, reminders, and triggers', youtubeId: PLACEHOLDER_ID, duration: '4-5 min' },
  { id: 'pro4', title: 'Custom Client Portal Branding', description: 'Advanced portal customization options', youtubeId: PLACEHOLDER_ID, duration: '3-4 min' },
  { id: 'pro5', title: 'Bulk Client Import', description: 'Import clients from CSV or other systems', youtubeId: PLACEHOLDER_ID, duration: '3 min' },
  { id: 'pro6', title: 'API & Integrations', description: 'Connecting FilersHub with other tools in your stack', youtubeId: PLACEHOLDER_ID, duration: '4-5 min' },
];

const Tutorials: React.FC = () => {
  const [tierLoading, setTierLoading] = useState(true);
  const [tier, setTier] = useState<string>('Core');
  const [activeVideo, setActiveVideo] = useState<TutorialVideo | null>(null);

  // Try to detect subscription tier from URL params (optional — page is public)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get('location_id');
    const email = params.get('email');

    if (!locationId || !email) {
      setTierLoading(false);
      return;
    }

    fetch('/api/widget-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, email }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.subscriptionTier) {
          setTier(data.subscriptionTier);
        }
      })
      .catch(() => {})
      .finally(() => setTierLoading(false));
  }, []);

  // Inject keyframe animations
  useEffect(() => {
    const styleId = 'tutorials-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

  const isPro = tier === 'Pro';

  if (tierLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: FH_GREEN }} />
      </div>
    );
  }

  const fadeIn = (delay: number): React.CSSProperties => ({
    animation: `fadeIn 0.4s ease-out ${delay * 0.08}s forwards`,
    opacity: 0,
  });

  const card: React.CSSProperties = { position: 'relative', zIndex: 2 };

  const VideoCard = ({ video }: { video: TutorialVideo }) => (
    <button
      onClick={() => setActiveVideo(video)}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden text-left hover:shadow-md hover:border-slate-300 transition-all group w-full"
    >
      <div className="relative">
        <img
          src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
          alt={video.title}
          className="w-full aspect-video object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            <Play className="w-5 h-5 text-slate-800 ml-0.5" fill="currentColor" />
          </div>
        </div>
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-[10px] font-bold bg-black/70 text-white rounded">
          {video.duration}
        </span>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{video.title}</p>
        <p className="text-xs text-slate-500 mt-1">{video.description}</p>
      </div>
    </button>
  );

  const VideoSection = ({ title, videos, delay }: { title: string; videos: TutorialVideo[]; delay: number }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ ...card, ...fadeIn(delay) }}>
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {videos.map((v) => <VideoCard key={v.id} video={v} />)}
      </div>
    </div>
  );

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
        <div className="text-center pt-4 pb-2" style={{ ...card, animation: 'fadeIn 0.4s ease-out forwards' }}>
          <img src={LOGO_URL} alt="FilersHub" className="h-10 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-slate-800">Training Library</h1>
          <p className="text-xs text-slate-500 mt-1">Step-by-step video guides to help you get the most out of FilersHub</p>
        </div>

        {/* Getting Started */}
        <VideoSection title="Getting Started" videos={GETTING_STARTED_VIDEOS} delay={1} />

        {/* Managing Your Practice */}
        <VideoSection title="Managing Your Practice" videos={PRACTICE_VIDEOS} delay={2} />

        {/* Pro Training */}
        {isPro ? (
          <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ ...card, ...fadeIn(3) }}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Pro Training</h2>
              <span className="px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-amber-50 text-amber-600 border border-amber-100">Pro</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRO_VIDEOS.map((v) => <VideoCard key={v.id} video={v} />)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden" style={{ ...card, ...fadeIn(3) }}>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Pro Training</h2>
              <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">
                Unlock {PRO_VIDEOS.length} advanced tutorials covering automations, analytics, bulk imports, and more.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-w-md mx-auto">
                {PRO_VIDEOS.map((v) => (
                  <div key={v.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1.5">
                    <Play className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-slate-300 truncate">{v.title}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: `linear-gradient(135deg, ${FH_ORANGE}, #e07d00)`, color: 'white' }}>
                <Zap className="w-4 h-4" />
                Upgrade to Pro
              </div>
            </div>
          </div>
        )}

        {/* Support Footer */}
        <div className="flex items-center justify-center gap-2 pt-2 pb-4" style={{ ...card, ...fadeIn(4) }}>
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <a href="mailto:support@filershub.com" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Need help? support@filershub.com
          </a>
        </div>
      </div>

      {/* Video Modal */}
      {activeVideo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 50 }} onClick={() => setActiveVideo(null)}>
          <div className="bg-white rounded-xl overflow-hidden w-full max-w-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">{activeVideo.title}</p>
              <button onClick={() => setActiveVideo(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src={`https://www.youtube.com/embed/${activeVideo.youtubeId}?rel=0&autoplay=1`}
                title={activeVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tutorials;
