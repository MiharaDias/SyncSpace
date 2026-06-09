import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import GoogleCallback from './pages/auth/GoogleCallback';
import GoogleSignup from './pages/auth/GoogleSignup';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/calendar/CalendarPage';
import MeetingsPage from './pages/meetings/MeetingsPage';
import TasksPage from './pages/tasks/TasksPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import AdminPage from './pages/admin/AdminPage';
import ManagerPage from './pages/manager/ManagerPage';
import SettingsPage from './pages/settings/SettingsPage';
import ProjectsPage from './pages/projects/ProjectsPage';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, token } = useAuthStore();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!user.is_approved) return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1a]">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 rounded-full bg-yellow-600/20 border border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⏳</span>
        </div>
        <p className="text-xl font-bold text-white mb-2">Account Pending Approval</p>
        <p className="text-sm text-muted-foreground">Your account is pending administrator approval. You'll be notified when approved.</p>
        <button className="mt-6 text-blue-400 hover:underline text-sm" onClick={() => useAuthStore.getState().logout()}>
          Sign out
        </button>
      </div>
    </div>
  );
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:token" element={<Register />} />
        <Route path="/auth/google-callback" element={<GoogleCallback />} />
        <Route path="/google-signup" element={<GoogleSignup />} />

        {/* Protected app */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="manager" element={
            <ProtectedRoute roles={['manager', 'administrator']}><ManagerPage /></ProtectedRoute>
          } />
          <Route path="admin" element={
            <ProtectedRoute roles={['administrator']}><AdminPage /></ProtectedRoute>
          } />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
