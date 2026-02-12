import React from 'react';
import { UserRole } from '../types';
import { ShieldCheck, Users, Briefcase, UserCircle } from 'lucide-react';



const RoleCard = ({ role, description, icon: Icon, onSelect }: any) => (
  <button
    onClick={() => onSelect(role)}
    className="group relative bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-[#4aa936] transition-all duration-300 flex flex-col items-center text-center space-y-4 overflow-hidden"
  >
    <div className="absolute top-0 right-0 w-24 h-24 bg-[#4aa936]/5 rounded-bl-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
    <div className="p-4 rounded-2xl bg-[#f0f9ed] text-[#4aa936] group-hover:bg-[#4aa936] group-hover:text-white transition-colors duration-300">
      <Icon size={32} />
    </div>
    <h3 className="text-xl font-bold text-slate-800">{role}</h3>
    <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    <div className="pt-4 flex items-center text-[#4aa936] font-semibold text-sm">
      Enter Dashboard
      <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
    </div>
  </button>
);

import { useAuth } from '../contexts/AuthContext';

const RoleSelection: React.FC = () => {
  const { bypassAuth } = useAuth();
  const onSelectRole = async (role: UserRole) => {
    await bypassAuth(role);
  };
  const logoUrl = "https://storage.googleapis.com/msgsndr/4X2JY0JipOsTk1oyWC4a/media/6970261e7b1aed27424cce3c.png";

  const roles = [
    {
      role: UserRole.FirmOwner,
      description: "Complete authority over the firm, analytics, and high-level billing.",
      icon: ShieldCheck
    },
    {
      role: UserRole.Manager,
      description: "Manage teams, monitor workflows, and oversee client accounts.",
      icon: Users
    },
    {
      role: UserRole.TaxPro,
      description: "Focused view on assigned tasks, documents, and professional messaging.",
      icon: Briefcase
    },
    {
      role: UserRole.Client,
      description: "Upload tax documents, track progress, and communicate with your pro.",
      icon: UserCircle
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="mb-12 text-center flex flex-col items-center">
        <img src={logoUrl} alt="FilersHub Logo" className="h-16 w-auto mb-6 drop-shadow-sm" />
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to FilersHub</h1>
        <p className="text-slate-500 max-w-md">Please select your role to access your dedicated workspace and manage your tax journey.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full mb-16">
        {roles.map((item) => (
          <RoleCard
            key={item.role}
            role={item.role}
            description={item.description}
            icon={item.icon}
            onSelect={onSelectRole}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
          Integrated with CRM Infrastructure v2.4
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;