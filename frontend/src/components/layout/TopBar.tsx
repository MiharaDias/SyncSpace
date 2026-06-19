import { Bell, ChevronDown, Check, Building2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useDepartmentsStore } from '../../lib/departments';

export function TopBar({ title }: { title: string }) {
  const { user, currentDepartment, setCurrentDepartment } = useAuthStore();
  const { departments: allDepts, fetch: fetchDepts } = useDepartmentsStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [deptOpen, setDeptOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    api.get('/api/notifications/unread-count')
      .then(r => setUnreadCount(r.data.count))
      .catch(() => {});
  }, [user, location.pathname]);

  // Admins need the full department list from the store
  useEffect(() => {
    if (user?.role === 'administrator') fetchDepts();
  }, [user?.role]);

  // Close dept dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDeptOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Admins always see all departments; other users see their assigned departments
  const userDepts: string[] = user?.role === 'administrator'
    ? allDepts
    : user?.departments?.length
      ? user.departments
      : user?.department
        ? [user.department]
        : [];

  const canSwitch = userDepts.length > 1 || user?.role === 'administrator';

  // Options: "all" for admins / multi-dept users + each individual dept
  const deptOptions: string[] = [];
  if (user?.role === 'administrator' || userDepts.length > 1) {
    deptOptions.push('all');
  }
  deptOptions.push(...userDepts);

  const displayLabel = currentDepartment === 'all' ? 'All Departments' : currentDepartment;

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0f1e]/50 backdrop-blur-sm shrink-0">
      <h1 className="text-lg font-semibold text-white">{title}</h1>

      <div className="flex items-center gap-3">

        {/* ── Department indicator / switcher ─────────────────────────────── */}
        {userDepts.length > 0 && (
          <div ref={dropRef} className="relative">
            {canSwitch ? (
              /* Multi-dept: clickable dropdown */
              <button
                onClick={() => setDeptOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-600/15 hover:bg-blue-600/25 text-sm transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-blue-200 font-medium max-w-[150px] truncate">{displayLabel}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-blue-300 transition-transform shrink-0 ${deptOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              /* Single-dept: static pill */
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/20 bg-blue-600/10 text-sm">
                <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-blue-200 font-medium max-w-[150px] truncate">{displayLabel}</span>
              </div>
            )}

            {deptOpen && canSwitch && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-white/10 bg-[#0f1629] shadow-2xl z-50 py-1.5 overflow-hidden">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Switch Department
                </p>
                {deptOptions.map(d => (
                  <button
                    key={d}
                    onClick={() => { setCurrentDepartment(d); setDeptOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {d === 'all'
                        ? <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        : <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      }
                      <span className={currentDepartment === d ? 'text-blue-300 font-semibold' : 'text-white'}>
                        {d === 'all' ? 'All Departments' : d}
                      </span>
                    </div>
                    {currentDepartment === d && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notification bell */}
        <Link
          to="/notifications"
          className="relative p-2 text-blue-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User display */}
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-white">{user?.full_name}</p>
          <p className="text-xs text-blue-300 capitalize">{user?.role}</p>
        </div>
      </div>
    </header>
  );
}
