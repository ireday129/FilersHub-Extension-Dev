import React, { useState, useEffect, useCallback } from 'react';
import { NavItem, UserRole, isStaffRole, TaxReturn, TaxReturnStatus, TAX_RETURN_TYPES } from './types';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Documents from './components/Documents';
import Tasks from './components/Tasks';
import Settings from './components/Settings';
import Profile from './components/Profile';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, Loader2 } from 'lucide-react';
import { useFirmData } from './hooks/useFirmData';
const initialTaxReturns: TaxReturn[] = [
  {
    id: 'tr1',
    clientName: 'John Doe',
    year: '2023',
    type: TAX_RETURN_TYPES.INDIVIDUAL_1040.label,
    status: TaxReturnStatus.Filed,
    preparer: 'Sarah Johnson',
    date: 'Mar 15, 2024',
    amount: '$2,105.00',
    agi: '$85,400.00',
    federalBalance: '$1,200.00 Refund',
    stateBalance: '$340.00 Due',
    paymentType: 'Invoice',
    files: [
      { name: '1040_Final_Signed.pdf', size: '1.2 MB', type: 'PDF' },
      { name: 'Schedule_C_Profit_Loss.pdf', size: '450 KB', type: 'PDF' },
      { name: 'Tax_Payment_Confirmation.png', size: '1.1 MB', type: 'Image' }
    ]
  },
  {
    id: 'tr2',
    clientName: 'Jane Smith',
    year: '2023',
    type: TAX_RETURN_TYPES.BUSINESS_S_CORP_1120S.label,
    status: TaxReturnStatus.ComplianceReview,
    preparer: 'David Smith',
    date: 'Apr 02, 2024',
    amount: 'N/A',
    agi: '--',
    federalBalance: '--',
    stateBalance: '--',
    paymentType: 'Invoice',
    files: [
      { name: 'Draft_1120S_V2.pdf', size: '2.4 MB', type: 'PDF' },
      { name: 'Business_Expenses_Summary.xlsx', size: '840 KB', type: 'XLSX' }
    ]
  },
  {
    id: 'tr3',
    clientName: 'Sarah Jenkins',
    year: '2022',
    type: TAX_RETURN_TYPES.INDIVIDUAL_1040.label,
    status: TaxReturnStatus.Accepted,
    preparer: 'Marcus Aurelius',
    date: 'Apr 10, 2023',
    amount: '$1,850.00',
    agi: '$72,100.00',
    federalBalance: '$850.00 Refund',
    stateBalance: '$120.00 Refund',
    paymentType: 'Bank Product',
    files: [
      { name: '1040_Full_Return_2022.pdf', size: '3.1 MB', type: 'PDF' }
    ]
  },
  {
    id: 'tr4',
    clientName: 'Robert California',
    year: '2024',
    type: TAX_RETURN_TYPES.INDIVIDUAL_1040.label,
    status: TaxReturnStatus.IntakeReceived,
    preparer: 'Sarah Johnson',
    date: 'May 12, 2024',
    amount: 'N/A',
    agi: '--',
    federalBalance: '--',
    stateBalance: '--',
    paymentType: 'Invoice',
    files: []
  },
  {
    id: 'tr5',
    clientName: 'Stanley Hudson',
    year: '2023',
    type: TAX_RETURN_TYPES.INDIVIDUAL_1040.label,
    status: TaxReturnStatus.InPreparation,
    preparer: 'David Smith',
    date: 'Jun 10, 2024',
    amount: 'N/A',
    agi: '--',
    federalBalance: '--',
    stateBalance: '--',
    paymentType: 'Invoice',
    files: []
  },
];



import { useExtensionMode } from './hooks/useExtensionMode';
import FirmSelection from './components/FirmSelection';

const AuthenticatedApp: React.FC = () => {
  const { user, signOut } = useAuth();
  const { returns, setReturns, loading: dataLoading, refresh, firmId, firmSettings, setFirmSettings, userAvatar, availableFirms, selectFirm } = useFirmData();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null); // TODO: fetch from user profile
  const [activeTab, setActiveTab] = useState<NavItem>(NavItem.Dashboard);
  // const [returns, setReturns] = useState<TaxReturn[]>(initialTaxReturns);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);

  const { isExtension } = useExtensionMode();

  // Global Firm Settings - now fetched from useFirmData


  // Fetch role from user profile (metadata)
  useEffect(() => {
    if (user?.user_metadata?.role) {
      setSelectedRole(user.user_metadata.role as UserRole);
    } else if (!selectedRole) {
      // Logic to determine role would go here. For now default to FirmOwner for dev
      setSelectedRole(UserRole.FirmOwner);
    }
  }, [user, selectedRole]);

  // Handle URL Path Routing (No hashes allowed per project rules)
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;
      if (path === '/super-admin') {
        setSelectedRole(UserRole.SuperAdmin);
      } else if (path === '/' || path === '/index.html') {
        // Only reset if we were specifically in super admin mode via path
        setSelectedRole(prev => prev === UserRole.SuperAdmin ? UserRole.FirmOwner : prev);
      }
    };

    handlePathChange();
    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', handlePathChange);
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

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
          />
        );
      case NavItem.Clients:
        return (
          <Clients
            role={currentRole}
            returns={returns}
            setSelectedReturnId={setSelectedReturnId}
            setActiveTab={setActiveTab}
          />
        );
      case NavItem.Documents:
        return <Documents role={currentRole} returns={returns} setReturns={setReturns} firmId={firmId} />;
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
      case NavItem.Profile:
        return <Profile role={currentRole} />;
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
    <div className={`flex flex-col min-h-screen bg-slate-50 ${isExtension ? 'text-sm overflow-x-hidden max-w-[100vw]' : ''}`}>
      {!isSuperAdmin && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          role={selectedRole || UserRole.FirmOwner}
          firmName={firmSettings.name}
          firmLogo={firmSettings.logo}
          compact={isExtension}
        />
      )}

      <main className={`flex-1 overflow-y-auto ${isExtension ? 'p-3' : 'p-4 md:p-8'}`}>
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
                {isSuperAdmin ? "Platform Overview" : isClient ? `Hello, ${user?.email}` : activeTab}
              </h1>
              {!isExtension && (
                <p className="text-slate-500 text-sm mt-1">
                  {isSuperAdmin
                    ? "Monitoring firms and platform infrastructure usage."
                    : isClient ? `Welcome to the ${firmSettings.name} Portal` : `Manage firm operations as a ${selectedRole}.`}
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

          {renderContent()}
        </div>
      </main>
    </div>
  );
};

import RoleSelection from './components/RoleSelection';
import StaffLogin from './components/StaffLogin';
import SuperAdminLogin from './components/SuperAdminLogin';

import { getFirmBySlug, PublicFirmData } from './services/firms';
import Login from './components/auth/Login';
import { useGhlContext } from './hooks/useGhlContext';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { isExtension } = useExtensionMode();
  const { ghlContext, loading: ghlLoading } = useGhlContext(isExtension);
  const [path, setPath] = useState(window.location.pathname);
  const [firmBranding, setFirmBranding] = useState<PublicFirmData['firm_name' | 'logo_url' | 'brand_color'] | null>(null);
  const [isFirmLoading, setIsFirmLoading] = useState(false);
  const [launchpadUrl, setLaunchpadUrl] = useState<string | null>(null);

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
              name: firmData.firm_name,
              logo: firmData.logo_url,
              color: firmData.brand_color
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

  // GHL SSO Trigger
  useEffect(() => {
    // 1. Check if we're not logged in and not loading
    if (loading || user) return;

    // 2. Check if we are inside an iframe (GHL context)
    const inIframe = window.self !== window.top;
    if (!inIframe) return;

    // 3. Extract GHL Params
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get('location_id') || params.get('locationId');
    const userId = params.get('user_id') || params.get('userId');
    const userEmail = params.get('user_email') || params.get('userEmail'); // New: Support email

    // 4. Trigger SSO if we have enough info
    if (locationId && (userId || userEmail)) {
      console.log("CRM Context Detected: Initiating SSO...");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let ssoUrl = `${supabaseUrl}/functions/v1/crm-auth/init?action=sso&locationId=${locationId}`;

      if (userId) ssoUrl += `&userId=${userId}`;
      if (userEmail) ssoUrl += `&userEmail=${encodeURIComponent(userEmail)}`;

      // Check if we've been told to show launchpad (silent SSO failed)
      const showLaunchpad = params.get('show_launchpad');
      if (showLaunchpad) {
        // Silent SSO already failed — show OAuth launchpad
        setLaunchpadUrl(ssoUrl);
      } else {
        // Try silent SSO first by navigating iframe directly
        // If it works: redirects to /dashboard#tokens
        // If it fails: redirects back with ?show_launchpad=true
        console.log("Attempting silent SSO in iframe...");
        window.location.href = ssoUrl + '&iframe=1';
        return;
      }
    } else {
      // 5. Fallback: If in iframe but missing params (locationId/userId), redirect to home (Staff Login)
      if (window.location.pathname !== '/') {
        console.log("CRM Context: Missing params, redirecting to Staff Login");
        window.location.href = '/';
      }
    }
  }, [loading, user]);

  if (launchpadUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-2">Connect to CRM</h1>
          <p className="text-slate-500 mb-6 text-sm">
            To securely access FilersHub within your CRM, please authorize the connection once.
          </p>
          <a
            href={launchpadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors w-full mb-4"
          >
            Connect Now
          </a>
          <button
            onClick={() => { window.location.href = launchpadUrl!; }}
            className="text-sm text-slate-400 hover:text-slate-600 underline"
          >
            I've connected, refresh page
          </button>
        </div>
      </div>
    );
  }


  if (loading || isFirmLoading || (isExtension && ghlLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Secure Super Admin Dashboard
  if (path === '/super-admin') {
    if (!user) {
      return <SuperAdminLogin />;
    }

    if (user.email === 'irene@hannahfinancial.com') {
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
        color: firmBranding.brand_color
      }} />;
    }

    // Generic login page
    if (path === '/login') {
      return <Login />;
    }

    // Home page: Staff Login (default landing page)
    return <StaffLogin ghlContext={isExtension ? ghlContext : null} />;
  }

  return <AuthenticatedApp />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;