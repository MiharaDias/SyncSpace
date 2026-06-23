import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calendar': 'Calendar',
  '/meetings': 'Meetings',
  '/tasks': 'My Tasks',
  '/projects': 'Projects',
  '/notifications': 'Notifications',
  '/manager': 'Team Overview',
  '/admin': 'Admin Panel',
  '/settings': 'Settings',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const base = '/' + pathname.split('/')[1];
  const title = pageTitles[base] || 'SyncSpace';
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} onMenuToggle={() => setMobileSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
