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
  // Match /projects/:id too
  const base = '/' + pathname.split('/')[1];
  const title = pageTitles[base] || 'SyncSpace';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
