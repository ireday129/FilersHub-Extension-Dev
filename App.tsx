import React, { useState, useEffect, useCallback } from 'react';
import { NavItem, UserRole, isStaffRole, TaxReturn, TaxReturnStatus, TAX_RETURN_TYPES } from './types';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Documents from './components/Documents';
import Tasks from './components/Tasks';
import Settings from './components/Settings';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, ChevronDown, Loader2 } from 'lucide-react';
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



const AuthenticatedApp: React.FC = () => {
  const { user, signOut } = useAuth();
  const { returns, setReturns, loading: dataLoading, refresh, firmId, firmSettings, setFirmSettings } = useFirmData();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null); // TODO: fetch from user profile
  const [activeTab, setActiveTab] = useState<NavItem>(NavItem.Dashboard);
  // const [returns, setReturns] = useState<TaxReturn[]>(initialTaxReturns);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);

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
        return <Documents role={currentRole} returns={returns} setReturns={setReturns} />;
      case NavItem.Tasks:
        return <Tasks />;
      case NavItem.Settings:
        return (
          <Settings
            firmSettings={firmSettings}
            setFirmSettings={setFirmSettings}
            firmId={firmId}
          />
        );
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

  const ProfileBubble = ({ name, subtext, avatarSeed }: any) => (
    <button className="flex items-center gap-3 bg-white p-1.5 pr-4 rounded-full border border-slate-200 shadow-sm hover:shadow-md transition-shadow group shrink-0">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200">
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="text-left">
        <p className="text-[11px] font-bold text-slate-800 leading-tight">{name}</p>
        <p className="text-[9px] text-slate-500 font-medium">{subtext}</p>
      </div>
      <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {!isSuperAdmin && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          role={selectedRole || UserRole.FirmOwner}
          firmName={firmSettings.name}
          firmLogo={firmSettings.logo}
        />
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm ${isSuperAdmin
                  ? 'text-purple-600 bg-purple-50 border-purple-100'
                  : isStaff
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-100'
                    : 'text-brand bg-brand-light border-brand/20'
                  }`}>
                  {isSuperAdmin ? 'Platform SuperAdmin' : isStaff ? 'Staff Workspace' : 'Client Workspace'} • {selectedRole}
                </span>
                <button
                  onClick={handleExitSession}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors bg-white px-2 py-1 rounded border border-slate-100"
                >
                  <LogOut size={10} /> Sign Out
                </button>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">
                {isSuperAdmin ? "Platform Overview" : isClient ? `Hello, ${user?.email}` : activeTab}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {isSuperAdmin
                  ? "Monitoring firms and platform infrastructure usage."
                  : isClient ? `Welcome to the ${firmSettings.name} Portal` : `Manage firm operations as a ${selectedRole}.`}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              {!isSuperAdmin && isStaff && (
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse"></span>
                  Firm CRM Sync Active
                </div>
              )}

              {isSuperAdmin && (
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-white px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>
                  Global Administration Mode
                </div>
              )}

              <ProfileBubble
                name={user?.user_metadata?.full_name || "User"}
                subtext={isSuperAdmin ? "FilersHub HQ" : isClient ? "Applewood LLC" : (selectedRole === UserRole.FirmOwner ? "Owner & CEO" : "Tax Professional")}
                avatarSeed={user?.email || "User"}
              />
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

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePathChange = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePathChange);
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Secure Super Admin Dashboard
  if (path === '/super-admin') {
    if (!user) {
      return <StaffLogin />;
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
    if (path === '/staff-access') {
      return <StaffLogin />;
    }
    return <RoleSelection />;
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