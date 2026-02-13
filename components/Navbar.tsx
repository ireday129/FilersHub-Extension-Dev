import React, { useState } from 'react';
import { NavItem, UserRole, isStaffRole } from '../types';
import {
  LayoutDashboard,
  Users,
  Files,
  CheckSquare,
  Settings,
  Menu,
  X
} from 'lucide-react';

interface NavbarProps {
  activeTab: NavItem;
  setActiveTab: (tab: NavItem) => void;
  role: UserRole;
  firmName: string;
  firmLogo: string;
  compact?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, role, firmName, firmLogo, compact }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isStaff = isStaffRole(role);
  const isFirmOwner = role === UserRole.FirmOwner;
  const isClient = role === UserRole.Client;

  // Define which items are visible based on role
  // Client role gets NO navigation items as per specific requirement
  const navItems = isClient ? [] : [
    { name: NavItem.Dashboard, icon: LayoutDashboard, visible: true },
    { name: NavItem.Clients, icon: Users, visible: isStaff },
    { name: NavItem.Documents, icon: Files, visible: true },
    { name: NavItem.Tasks, icon: CheckSquare, visible: isStaff },
    { name: NavItem.Settings, icon: Settings, visible: isFirmOwner },
  ].filter(item => item.visible);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className={`flex items-center mx-auto ${compact ? 'px-4 h-14' : 'px-4 md:px-8 h-16 max-w-7xl'}`}>

        {/* Left Section: Mobile hamburger (non-extension only) */}
        <div className="flex-1 flex items-center">
          {!compact && navItems.length > 0 && (
            <button
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Navigation"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>

        {/* Center Section: Navigation */}
        {compact ? (
          /* Extension mode: centered icon-only nav buttons */
          navItems.length > 0 && (
            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.name}
                  onClick={() => setActiveTab(item.name)}
                  title={item.name}
                  className={`p-2 rounded-lg transition-all ${activeTab === item.name
                      ? 'bg-brand text-white shadow-sm shadow-brand/20'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  <item.icon size={18} />
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="hidden lg:flex justify-center h-full">
            {navItems.length > 0 && (
              <div className="flex items-center gap-2 h-full">
                {navItems.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => setActiveTab(item.name)}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === item.name
                        ? 'bg-brand text-white shadow-md shadow-brand/20'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                  >
                    <item.icon size={18} />
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right Section: Brand Logo and Name (Always Visible) */}
        <div className="flex-1 flex items-center justify-end gap-3">
          <span className={`text-xl font-bold text-slate-800 tracking-tight hidden sm:block ${compact ? 'text-base' : ''}`}>{firmName}</span>
          <img src={firmLogo} alt={`${firmName} Logo`} className={`${compact ? 'h-7' : 'h-9'} w-auto object-contain`} />
        </div>
      </div>

      {/* Mobile Menu Dropdown (non-extension only) */}
      {!compact && isMobileMenuOpen && navItems.length > 0 && (
        <div className="lg:hidden bg-white border-t border-slate-100 py-4 px-4 space-y-2 shadow-2xl animate-in slide-in-from-top duration-300">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                setActiveTab(item.name);
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === item.name
                  ? 'bg-brand text-white font-bold shadow-lg shadow-brand/20'
                  : 'text-slate-500 hover:bg-slate-50'
                }`}
            >
              <item.icon size={20} />
              {item.name}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;