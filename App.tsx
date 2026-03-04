import React, { useState, useEffect } from 'react';
import { NavItem, UserRole, isStaffRole } from './types';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Documents from './components/Documents';
import Tasks from './components/Tasks';
import Settings from './components/Settings';
import Profile from './components/Profile';
import TranscriptMonitorHub from './components/TranscriptMonitorHub';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import SubscriptionBlockedScreen from './components/SubscriptionBlockedScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, Loader2, AlertTriangle } from 'lucide-react';
import { useFirmData } from './hooks/useFirmData';
import { useExtensionMode } from './hooks/useExtensionMode';
import FirmSelection from './components/FirmSelection';
import GhlWidget from './components/GhlWidget';
import Tutorials from './components/Tutorials';
import CrmAccessPage from './components/CrmAccessPage';

const DASHBOARD_FLOATERS = [
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c6753b3cc9e7ef06603a.png', style: { top: 40, left: -60, width: 480 }, anim: 'floatA 5s ease-in-out infinite' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948cd064c0d134d507dede.png', style: { top: 10, right: -50, width: 560 }, anim: 'floatB 6s ease-in-out infinite 0.5s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6993c7b78ef1b9174835d5e6.png', style: { top: '45%', left: -20, width: 240 }, anim: 'floatC 4.5s ease-in-out infinite 1s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d27d614c99d54f2a8db.png', style: { top: '55%', right: -20, width: 360 }, anim: 'floatD 5.5s ease-in-out infinite 0.3s' },
  { src: 'https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/69948d63d614c96431f2b40f.png', style: { bottom: 60, left: -10, width: 320 }, anim: 'floatE 5s ease-in-out infinite 0.8s' },
];

const DASHBOARD_KEYFRAMES = `
@keyframes floatA { 0%, 100% { transform: translateY(0) rotate(-15deg); } 50% { transform: translateY(-12px) rotate(-11deg); } }
@keyframes floatB { 0%, 100% { transform: translateY(0) rotate(12deg); } 50% { transform: translateY(-14px) rotate(16deg); } }
@keyframes floatC { 0%, 100% { transform: translateY(0) rotate(-25deg); } 50% { transform: translateY(-9px) rotate(-20deg); } }
@keyframes floatD { 0%, 100% { transform: translateY(0) rotate(8deg); } 50% { transform: translateY(-11px) rotate(13deg); } }
@keyframes floatE { 0%, 100% { transform: translateY(0) rotate(-40deg); } 50% { transform: translateY(-10px) rotate(-35deg); } }
`;

const AuthenticatedApp: React.FC<{ targetFirmId?: string | null }> = ({ targetFirmId }) => {
  const { user, signOut } = useAuth();
  const { returns, setReturns, loading: dataLoading, refresh, firmId, firmSettings, setFirmSettings, availableFirms, selectFirm, staffName } = useFirmData();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState<NavItem>(NavItem.Dashboard);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);

  const { isExtension } = useExtensionMode();

  // Auto-select the target firm when coming from /crm with a specific location
  useEffect(() => {
    if (targetFirmId && availableFirms.length > 0 && firmId !== targetFirmId) {
      const match = availableFirms.find(f => f.id === targetFirmId);
      if (match) {
        selectFirm(targetFirmId);
      }
    }
  }, [targetFirmId, availableFirms, firmId]);

  // Determine role: URL path takes priority, then user metadata, then first available firm
  useEffect(() => {
    const resolveRole = () => {
      const path = window.location.pathname;
      if (path === '/super-admin') {
        setSelectedRole(UserRole.SuperAdmin);
      } else if (user?.user_metadata?.role) {
        setSelectedRole(prev => prev === UserRole.SuperAdmin ? (user.user_metadata.role as UserRole) : (prev || user.user_metadata.role as UserRole));
      } else if (availableFirms && availableFirms.length > 0) {
        setSelectedRole(prev => prev || availableFirms[0].role as UserRole);
      }
    };

    resolveRole();
    window.addEventListener('popstate', resolveRole);
    return () => window.removeEventListener('popstate', resolveRole);
  }, [user, availableFirms]);

  // Dynamic Theme Injection
  useEffect(() => {
    const styleId = 'firm-brand-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = `
      :root {
        --firm-brand: ${firmSettings.color};
        --firm-brand-light: ${firmSettings.color}15;
      }
      .bg-brand { background-color: var(--firm-brand) !important; }
      .text-brand { color: var(--firm-brand) !important; }
      .border-brand { border-color: var(--firm-brand) !important; }
      .bg-brand-light { background-color: var(--firm-brand-light) !important; }
      .hover\\:border-brand:hover { border-color: var(--firm-brand) !important; }
      .focus-within\\:ring-brand:focus-within { --tw-ring-color: var(--firm-brand); }
      .focus\\:ring-brand:focus { --tw-ring-color: var(--firm-brand); }
    `;
  }, [firmSettings.color]);

  // Inject floating background keyframes (desktop only)
  useEffect(() => {
    if (isExtension) return;
    const id = 'dashboard-float-keyframes';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = DASHBOARD_KEYFRAMES;
      document.head.appendChild(style);
    }
  }, [isExtension]);

  const renderContent = () => {
    if (dataLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" />
          <p className="font-medium">Loading firm data...</p>
        </div>
      );
    }

    const currentRole = selectedRole || UserRole.Client;



    // Multi-Firm Logic Check
    if (!firmId && availableFirms && availableFirms.length > 1) {
      return (
        <FirmSelection
          firms={availableFirms}
          onSelect={selectFirm}
          onLogout={handleExitSession}
          userEmail={user?.email}
        />
      );
    }

    if (selectedRole === UserRole.SuperAdmin) {
      return <SuperAdminDashboard />;
    }

    // Block access if subscription is canceled
    if (firmSettings.subscriptionStatus === 'canceled') {
      return <SubscriptionBlockedScreen />;
    }

    switch (activeTab) {
      case NavItem.Dashboard:
        return (
          <Dashboard
            role={currentRole}
            returns={returns}
            setReturns={setReturns}
            selectedReturnId={selectedReturnId}
            setSelectedReturnId={setSelectedReturnId}
            refreshData={refresh}
            firmId={firmId}
            isExtension={isExtension}
            currentStaffName={staffName}
          />
        );
      case NavItem.Clients:
        return (
          <Clients
            role={currentRole}
            returns={returns}
            setSelectedReturnId={setSelectedReturnId}
            setActiveTab={setActiveTab}
            firmId={firmId}
            refreshData={refresh}
            currentStaffName={staffName}
            firmSlug={firmSettings.slug}
            irsAlertsEnabled={firmSettings.irsAlertsEnabled}
          />
        );
      case NavItem.Documents:
        return <Documents role={currentRole} returns={returns} setReturns={setReturns} firmId={firmId} currentStaffName={staffName} />;
      case NavItem.Tasks:
        return <Tasks firmId={firmId} role={currentRole} isExtension={isExtension} />;
      case NavItem.Settings:
        return (
          <Settings
            firmSettings={firmSettings}
            setFirmSettings={setFirmSettings}
            firmId={firmId}
          />
        );
      case NavItem.Alerts:
        return <TranscriptMonitorHub />;
      case NavItem.Profile:
        return <Profile role={currentRole} setActiveTab={setActiveTab} />;
      default:
        return (
          <Dashboard
            role={currentRole}
            returns={returns}
            setReturns={setReturns}
            selectedReturnId={selectedReturnId}
            setSelectedReturnId={setSelectedReturnId}
            refreshData={refresh}
            firmId={firmId}
            isExtension={isExtension}
            currentStaffName={staffName}
          />
        );
    }
  };

  const handleExitSession = async () => {
    await signOut();
    setSelectedRole(null);
    setActiveTab(NavItem.Dashboard);
  };

  const isStaff = selectedRole ? isStaffRole(selectedRole) : false;
  const isClient = selectedRole === UserRole.Client;
  const isSuperAdmin = selectedRole === UserRole.SuperAdmin;

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${isExtension ? 'text-sm overflow-x-hidden max-w-[100vw]' : 'overflow-x-hidden'}`}>
      {!isExtension && DASHBOARD_FLOATERS.map((f, i) => (
        <img
          key={i}
          src={f.src}
          alt=""
          style={{ position: 'fixed', pointerEvents: 'none', zIndex: 0, opacity: 0.45, animation: f.anim, ...f.style }}
        />
      ))}
      {!isSuperAdmin && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          role={selectedRole || UserRole.FirmOwner}
          firmName={firmSettings.name}
          firmLogo={firmSettings.logo}
          irsAlertsEnabled={firmSettings.irsAlertsEnabled}
          compact={isExtension}
        />
      )}

      <main className={`flex-1 overflow-y-auto ${isExtension ? 'p-3' : 'p-4 md:p-8'}`} style={{ position: 'relative', zIndex: 1 }}>
        {firmSettings.subscriptionStatus === 'past_due' && selectedRole !== UserRole.SuperAdmin && (
          <div className="max-w-7xl mx-auto mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle className="text-amber-600 shrink-0" size={18} />
              <div>
                <p className="text-sm font-bold text-amber-800">Payment Issue</p>
                <p className="text-xs text-amber-600">
                  Your subscription payment failed. Please update your payment method to avoid service interruption.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto">
          <header className={`${isExtension ? 'mb-4' : 'mb-8'} flex ${isExtension ? 'flex-row items-start justify-between gap-4' : 'flex-col md:flex-row md:items-start justify-between gap-4'}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm ${isSuperAdmin
                  ? 'text-purple-600 bg-purple-50 border-purple-100'
                  : isStaff
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-100'
                    : 'text-brand bg-brand-light border-brand/20'
                  }`}>
                  {isSuperAdmin ? 'Platform SuperAdmin' : selectedRole}
                </span>
                {!isExtension && (
                  <button
                    onClick={handleExitSession}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors bg-white px-2 py-1 rounded border border-slate-100"
                  >
                    <LogOut size={10} /> Sign Out
                  </button>
                )}
              </div>
              <h1 className={`${isExtension ? 'text-xl' : 'text-2xl'} font-bold text-slate-800`}>
                {isSuperAdmin ? "Platform Overview"
                  : isClient ? `Hello, ${user?.user_metadata?.full_name || user?.email}`
                    : activeTab === NavItem.Dashboard ? `Hello, ${staffName || (user?.user_metadata?.full_name || user?.email || '').split(' ')[0]}`
                      : activeTab}
              </h1>
              {!isExtension && (
                <p className="text-slate-500 text-sm mt-1">
                  {isSuperAdmin
                    ? "Monitoring firms and platform infrastructure usage."
                    : isClient ? `Welcome to the ${firmSettings.name} Portal`
                      : activeTab === NavItem.Clients ? 'Manage your clients.'
                        : activeTab === NavItem.Documents ? 'Manage client documents.'
                          : activeTab === NavItem.Tasks ? 'Manage firm and client tasks.'
                            : ''}
                </p>
              )}
            </div>

            <div className={`flex ${isExtension ? 'items-center shrink-0' : 'flex-col items-end'} gap-2`}>
              {!isSuperAdmin && isStaff && (
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse"></span>
                  {isExtension ? 'CRM Sync' : 'Firm CRM Sync Active'}
                </div>
              )}

              {isSuperAdmin && (
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-white px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>
                  Global Administration Mode
                </div>
              )}

              {isExtension && (
                <button
                  onClick={handleExitSession}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors bg-white px-2 py-1 rounded border border-slate-100"
                >
                  <LogOut size={10} />
                </button>
              )}
            </div>
          </header>

          <div key={activeTab}>
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
};

import RoleSelection from './components/RoleSelection';
import StaffLogin from './components/StaffLogin';
import SuperAdminLogin from './components/SuperAdminLogin';
import InstallSuccess from './components/InstallSuccess';

import { getFirmBySlug } from './services/firms';
import Login from './components/auth/Login';
import ResetPassword from './components/auth/ResetPassword';
import { useGhlContext } from './hooks/useGhlContext';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { isExtension } = useExtensionMode();
  const { ghlContext, loading: ghlLoading } = useGhlContext(isExtension);
  const [path, setPath] = useState(window.location.pathname);
  const [firmBranding, setFirmBranding] = useState<{
    firm_id: string; name: string; logo: string; color: string; portalMessage: string;
  } | null>(null);
  const [isFirmLoading, setIsFirmLoading] = useState(false);
  const [crmFirmId, setCrmFirmId] = useState<string | null>(null);
  const [crmValidated, setCrmValidated] = useState(false);

  // Reset CRM validation when URL search params change (user toggles GHL location)
  useEffect(() => {
    const currentSearch = window.location.search;
    const handleLocationChange = () => {
      if (window.location.search !== currentSearch) {
        setCrmValidated(false);
        setCrmFirmId(null);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    const handlePathChange = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePathChange);
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

  // Handle Portal Logic
  useEffect(() => {
    const checkPortalPath = async () => {
      // Check if path is /portal/:slug
      const match = path.match(/^\/portal\/([^/]+)/);
      if (match) {
        const slug = match[1];
        setIsFirmLoading(true);
        try {
          // Fetch firm details by slug
          const firmData = await getFirmBySlug(slug);
          if (firmData) {
            setFirmBranding({
              firm_id: firmData.firm_id,
              name: firmData.firm_name,
              logo: firmData.logo_url,
              color: firmData.brand_color,
              portalMessage: firmData.portal_message || ''
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsFirmLoading(false);
        }
      } else {
        setFirmBranding(null);
      }
    };

    checkPortalPath();
  }, [path]);


  // GHL Dashboard Widget (no auth required — uses widget_token)
  if (path === '/widget') {
    return <GhlWidget />;
  }

  // GHL Tutorials Page (no auth required — uses widget_token)
  if (path === '/tutorials') {
    return <Tutorials />;
  }

  if (loading || isFirmLoading || (isExtension && ghlLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Install Success Page (no auth required)
  if (path === '/install-success') {
    return <InstallSuccess />;
  }

  // Auto-redirect super admins to /super-admin if they land on root
  if (user?.user_metadata?.is_super_admin === true && path === '/') {
    window.history.replaceState(null, '', '/super-admin');
    setPath('/super-admin');
  }

  // Secure Super Admin Dashboard
  if (path === '/super-admin') {
    if (!user) {
      return <SuperAdminLogin />;
    }

    if (user.user_metadata?.is_super_admin === true) {
      return (
        <div className="flex flex-col min-h-screen bg-slate-50 p-8">
          <SuperAdminDashboard />
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6">You do not have permission to view the Super Admin Dashboard.</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Password reset page (user is authenticated via recovery token)
  if (path === '/reset-password') {
    return <ResetPassword />;
  }

  // CRM Access Page — always validate location, even when authenticated
  if (path === '/crm') {
    if (!user) {
      return <CrmAccessPage />;
    }
    // Authenticated but not yet validated for this location
    if (!crmValidated) {
      return (
        <CrmAccessPage
          isAuthenticated
          onValidated={(firmId) => {
            setCrmFirmId(firmId);
            setCrmValidated(true);
          }}
        />
      );
    }
    // Validated — fall through to AuthenticatedApp with targetFirmId
  }

  if (!user) {
    // Dev-only role bypass tool
    if (path === '/dev') {
      return <RoleSelection />;
    }

    // Portal Login with Branding
    if (path.startsWith('/portal/') && firmBranding) {
      return <Login firmBranding={{
        name: firmBranding.name,
        logo: firmBranding.logo,
        color: firmBranding.color,
        portalMessage: firmBranding.portalMessage
      }} firmId={firmBranding.firm_id} />;
    }

    // Generic login page
    if (path === '/login') {
      return <Login />;
    }

    // Home page: Staff Login (default landing page)
    return <StaffLogin ghlContext={isExtension ? ghlContext : null} />;
  }

  return <AuthenticatedApp targetFirmId={crmFirmId} />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;