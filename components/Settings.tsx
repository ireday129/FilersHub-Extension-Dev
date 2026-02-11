import React, { useState } from 'react';
import { 
  Upload, 
  Palette, 
  Users, 
  Save, 
  Shield, 
  Globe, 
  Building2, 
  Hash, 
  CreditCard, 
  Check, 
  Sparkles,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { UserRole } from '../types';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
}

interface SettingsProps {
  firmSettings: {
    name: string;
    logo: string;
    color: string;
  };
  setFirmSettings: React.Dispatch<React.SetStateAction<{
    name: string;
    logo: string;
    color: string;
  }>>;
}

const Settings: React.FC<SettingsProps> = ({ firmSettings, setFirmSettings }) => {
  const [localSettings, setLocalSettings] = useState(firmSettings);
  const [staff, setStaff] = useState<StaffMember[]>([
    { id: '1', name: 'Marcus Aurelius', email: 'marcus@filershub.com', role: UserRole.Manager, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus' },
    { id: '2', name: 'David Smith', email: 'david@filershub.com', role: UserRole.TaxPro, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David' },
    { id: '3', name: 'Angela Martin', email: 'angela@filershub.com', role: UserRole.TaxPro, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Angela' },
  ]);

  const colors = ['#4aa936', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#334155'];

  const firmSlug = localSettings.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const portalUrl = `access.filershub.com/${firmSlug || 'portal'}`;

  const handleRoleChange = (id: string, newRole: UserRole) => {
    setStaff(prev => prev.map(member => 
      member.id === id ? { ...member, role: newRole } : member
    ));
  };

  const handleSave = () => {
    setFirmSettings(localSettings);
    // Simulate API Feedback
    alert(`Firm branding updated to ${localSettings.name}`);
  };

  const PlanFeature = ({ text }: { text: string }) => (
    <div className="flex items-start gap-2 group">
      <div className="mt-1 p-0.5 rounded-full bg-brand-light text-brand group-hover:bg-brand group-hover:text-white transition-colors">
        <Check size={10} strokeWidth={3} />
      </div>
      <span className="text-xs text-slate-600 font-medium leading-relaxed">{text}</span>
    </div>
  );

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Firm Profile & Branding Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-light text-brand rounded-lg">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Firm Profile & Branding</h2>
              <p className="text-xs text-slate-500">Manage your firm identity and portal aesthetics.</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-opacity-90 transition-colors shadow-sm"
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>

        <div className="p-8 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Firm Identity */}
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Firm Name</label>
                <div className="relative group">
                  <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand transition-colors" />
                  <input 
                    type="text" 
                    value={localSettings.name}
                    onChange={(e) => setLocalSettings(p => ({ ...p, name: e.target.value }))}
                    placeholder="Enter your firm name"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Portal Access URL</label>
                <div className="relative group">
                  <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <div className="w-full pl-10 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 flex items-center overflow-hidden">
                    <span className="truncate">{portalUrl}</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Your clients will use this specific link to log in.</p>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Firm Logo</label>
              <div className="flex items-center gap-6">
                <div className="w-28 h-28 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden group hover:border-brand/40 transition-colors">
                  <img 
                    src={localSettings.logo} 
                    alt="Firm Logo" 
                    className="w-20 h-auto object-contain transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Logo Image URL"
                      value={localSettings.logo}
                      onChange={(e) => setLocalSettings(p => ({ ...p, logo: e.target.value }))}
                      className="w-full px-4 py-2 bg-white border border-slate-200 text-xs font-semibold rounded-lg focus:ring-2 focus:ring-brand outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 max-w-[180px]">Enter a direct URL for your firm's logo (transparent PNG/SVG recommended).</p>
                </div>
              </div>
            </div>
          </div>

          {/* Color Palette */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
              <Palette size={16} className="text-brand" />
              Brand Primary Color
            </h3>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="flex flex-wrap gap-3">
                {colors.map(color => (
                  <button
                    key={color}
                    onClick={() => setLocalSettings(p => ({ ...p, color }))}
                    className={`w-11 h-11 rounded-xl border-4 transition-all hover:scale-110 ${
                      localSettings.color.toLowerCase() === color.toLowerCase() ? 'border-slate-800 shadow-md' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              
              <div className="flex items-center gap-4">
                <div className="h-10 w-[1px] bg-slate-200 hidden md:block"></div>
                <div className="space-y-2">
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom Hex Code</label>
                   <div className="relative group">
                     <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand" />
                     <input 
                       type="text"
                       value={localSettings.color}
                       onChange={(e) => {
                         let val = e.target.value;
                         if (!val.startsWith('#')) val = '#' + val;
                         setLocalSettings(p => ({ ...p, color: val }));
                       }}
                       className="pl-9 pr-4 py-2 w-32 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-brand outline-none uppercase"
                     />
                   </div>
                </div>
                <div 
                  className="w-10 h-10 rounded-lg shadow-inner border border-slate-100"
                  style={{ backgroundColor: localSettings.color }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Staff Management Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Team & Permissions</h2>
              <p className="text-xs text-slate-500">Manage your staff accounts and app access levels.</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Access Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full border border-slate-200 group-hover:border-brand/40 transition-colors" />
                      <span className="text-sm font-semibold text-slate-700">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-500">{member.email}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-brand" />
                      <select 
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                        className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer focus:text-brand"
                      >
                        <option value={UserRole.Manager}>Manager</option>
                        <option value={UserRole.TaxPro}>Tax Pro</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs font-bold text-rose-500 hover:text-rose-700 hover:underline transition-all">Revoke Access</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Firm Plan Area */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Firm Plan</h2>
              <p className="text-xs text-slate-500">Overview of FilersHub billing tiers and capabilities.</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Core Plan */}
            <div className="relative p-6 rounded-2xl border-2 border-slate-100 bg-slate-50/30 flex flex-col group hover:border-brand/20 transition-all">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-brand text-white text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 size={12} /> Active Plan
              </div>
              
              <div className="mb-6">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  Firm Core
                  <Zap size={18} className="text-amber-500" />
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">For solo pros and small teams who want power without chaos.</p>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">User Limits</h4>
                  <ul className="space-y-2">
                    <PlanFeature text="1 Firm Owner" />
                    <PlanFeature text="Up to 5 staff users" />
                    <PlanFeature text="Unlimited clients" />
                  </ul>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Core Features</h4>
                  <div className="grid grid-cols-1 gap-y-2">
                    <PlanFeature text="Multi-tenant firm setup" />
                    <PlanFeature text="Firm branded client portal" />
                    <PlanFeature text="Secure document uploads" />
                    <PlanFeature text="Missing document tracking" />
                    <PlanFeature text="Tax return pipeline stages" />
                    <PlanFeature text="Activity log per client" />
                    <PlanFeature text="Role-based access control" />
                    <PlanFeature text="Firebase Storage folders" />
                    <PlanFeature text="Basic reporting (Open cases)" />
                    <PlanFeature text="Standard support" />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Who this is for</h4>
                  <p className="text-xs font-semibold text-slate-600 bg-white p-3 rounded-lg border border-slate-100 italic">
                    "Solo EAs and CPAs, Small firms, and first-time CRM users."
                  </p>
                </div>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="relative p-6 rounded-2xl border-2 border-indigo-100 bg-indigo-50/10 flex flex-col group hover:border-indigo-400 transition-all overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity -mr-4 -mt-4">
                <Sparkles size={120} className="text-indigo-600" />
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-black text-indigo-900 flex items-center gap-2">
                  Firm Pro
                  <Sparkles size={18} className="text-indigo-500" />
                </h3>
                <p className="text-xs text-indigo-600 font-medium mt-1">For growth mode firms that need control, visibility, and scale.</p>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">User Limits</h4>
                  <ul className="space-y-2">
                    <PlanFeature text="1 Firm Owner" />
                    <PlanFeature text="Up to 20 staff users" />
                    <PlanFeature text="Unlimited clients" />
                  </ul>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3 italic">Everything in Core, plus:</h4>
                  <div className="grid grid-cols-1 gap-y-2">
                    <PlanFeature text="Advanced role permissions" />
                    <PlanFeature text="Staff workload visibility" />
                    <PlanFeature text="Internal only statuses (On Hold, Review)" />
                    <PlanFeature text="Case reassignment history" />
                    <PlanFeature text="Staff activity tracking" />
                    <PlanFeature text="Bulk document requests" />
                    <PlanFeature text="Advanced reporting & Bottlenecks" />
                    <PlanFeature text="Priority file handling flags" />
                    <PlanFeature text="Custom internal notes per case" />
                    <PlanFeature text="Branded email notifications" />
                    <PlanFeature text="Priority support queue" />
                  </div>
                </div>

                <div className="pt-4 border-t border-indigo-100">
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Who this is for</h4>
                  <p className="text-xs font-semibold text-indigo-900 bg-white p-3 rounded-lg border border-indigo-100 italic">
                    "Established tax firms, multi-preparer offices, and firms wanting visibility."
                  </p>
                </div>
              </div>

              <button className="mt-8 w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2">
                <Zap size={16} />
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;