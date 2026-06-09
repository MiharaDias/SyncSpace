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
  { to: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard, roles: ['user', 'manager', 'administrator'] },
  { to: '/calendar',      label: 'Calendar',     icon: Calendar,        roles: ['user', 'manager', 'administrator'] },
  { to: '/meetings',      label: 'Meetings',     icon: Clock,           roles: ['user', 'manager', 'administrator'] },
  { to: '/projects',      label: 'Projects',     icon: FolderKanban,    roles: ['user', 'manager', 'administrator'] },
  { to: '/tasks',         label: 'My Tasks',     icon: CheckSquare,     roles: ['user', 'manager', 'administrator'] },
  { to: '/notifications', label: 'Notifications',icon: Bell,            roles: ['user', 'manager', 'administrator'] },
  { to: '/manager',       label: 'Team Overview',icon: BarChart3,       roles: ['manager', 'administrator'] },
  { to: '/admin',         label: 'Admin Panel',  icon: UserCheck,       roles: ['administrator'] },
  { to: '/settings',      label: 'Settings',     icon: Settings,        roles: ['user', 'manager', 'administrator'] },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const visibleLinks = navLinks.filter(l => l.roles.includes(user.role));

  return (
    <aside className={`flex flex-col h-screen bg-[#0a0f1e] border-r border-white/10 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} shrink-0`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">SyncSpace</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-blue-300 hover:text-white transition-colors p-1 rounded"
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <X className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {visibleLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/30 text-white border border-blue-500/30'
                  : 'text-blue-200/70 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-white/10">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs">{getInitials(user.full_name)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
              <p className="text-xs text-blue-300 capitalize truncate">{user.role}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={logout} className="text-blue-300 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
