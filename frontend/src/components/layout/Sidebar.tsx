import { NavLink } from 'react-router-dom';
import {
  Calendar, Clock, Bell, CheckSquare, Settings,
  LayoutDashboard, UserCheck, BarChart3, LogOut, Menu, X, FolderKanban,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getInitials } from '../../lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useState } from 'react';

const navLinks = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard, roles: ['user', 'manager', 'administrator'] },
  { to: '/calendar',      label: 'Calendar',      icon: Calendar,        roles: ['user', 'manager', 'administrator'] },
  { to: '/meetings',      label: 'Meetings',      icon: Clock,           roles: ['user', 'manager', 'administrator'] },
  { to: '/projects',      label: 'Projects',      icon: FolderKanban,    roles: ['user', 'manager', 'administrator'] },
  { to: '/tasks',         label: 'My Tasks',      icon: CheckSquare,     roles: ['user', 'manager', 'administrator'] },
  { to: '/notifications', label: 'Notifications', icon: Bell,            roles: ['user', 'manager', 'administrator'] },
  { to: '/manager',       label: 'Team Overview', icon: BarChart3,       roles: ['manager', 'administrator'] },
  { to: '/admin',         label: 'Admin Panel',   icon: UserCheck,       roles: ['administrator'] },
  { to: '/settings',      label: 'Settings',      icon: Settings,        roles: ['user', 'manager', 'administrator'] },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const visibleLinks = navLinks.filter(l => l.roles.includes(user.role));
  const showLabels = !collapsed || mobileOpen;

  return (
    <>
      {/* Mobile backdrop — clicking it closes the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'flex flex-col h-screen bg-[#0a0f1e] border-r border-white/10 transition-all duration-300',
          // Mobile: fixed drawer, off-screen by default
          'fixed inset-y-0 left-0 z-50 w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static, side-by-side, collapsible width
          'md:relative md:translate-x-0 md:z-auto md:shrink-0',
          collapsed ? 'md:w-16' : 'md:w-60',
        ].join(' ')}
      >
        {/* Header */}
        <div className={`flex items-center px-4 py-4 border-b border-white/10 ${collapsed && !mobileOpen ? 'justify-center' : 'justify-between'}`}>
          {showLabels && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-lg tracking-tight">SyncSpace</span>
            </div>
          )}
          {/* Mobile: X button to close drawer */}
          <button
            onClick={onMobileClose}
            className="text-blue-300 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 md:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Desktop: collapse / expand toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-blue-300 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 hidden md:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Menu className="w-5 h-5" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {visibleLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/30 text-white border border-blue-500/30'
                    : 'text-blue-200/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {showLabels && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/10">
          <div className={`flex items-center gap-3 ${!showLabels ? 'justify-center' : ''}`}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{getInitials(user.full_name)}</AvatarFallback>
            </Avatar>
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
                <p className="text-xs text-blue-300 capitalize truncate">{user.role}</p>
              </div>
            )}
            {showLabels && (
              <button onClick={logout} className="text-blue-300 hover:text-red-400 transition-colors p-1">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
