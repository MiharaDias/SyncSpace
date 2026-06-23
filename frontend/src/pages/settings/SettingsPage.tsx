import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell, Calendar, CheckCircle, CheckSquare, FolderOpen,
  Loader2, LogOut, RefreshCw, UserCheck, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

// ─── Notification type definitions ────────────────────────────────────────────
type PrefMap = Record<string, boolean>;

const NOTIF_TYPES = [
  {
    type: 'meeting_invite',
    label: 'Meeting Invitations',
    description: 'When someone invites you to a meeting — includes a link to accept or decline',
    Icon: Calendar,
    color: 'text-blue-400',
    dot: 'bg-blue-500',
  },
  {
    type: 'meeting_update',
    label: 'Meeting Updates',
    description: 'When a meeting you are attending is rescheduled or its details change',
    Icon: RefreshCw,
    color: 'text-amber-400',
    dot: 'bg-amber-500',
  },
  {
    type: 'meeting_cancelled',
    label: 'Meeting Cancellations',
    description: 'When a meeting you are attending is cancelled',
    Icon: XCircle,
    color: 'text-red-400',
    dot: 'bg-red-500',
  },
  {
    type: 'task_assigned',
    label: 'Task Assignments',
    description: 'When a task is assigned to you',
    Icon: CheckSquare,
    color: 'text-violet-400',
    dot: 'bg-violet-500',
  },
  {
    type: 'project_assigned',
    label: 'Project Assignments',
    description: 'When you are added as a member of a project',
    Icon: FolderOpen,
    color: 'text-indigo-400',
    dot: 'bg-indigo-500',
  },
  {
    type: 'approval_status',
    label: 'Account Approval',
    description: 'When your account registration is approved or rejected by an administrator',
    Icon: UserCheck,
    color: 'text-emerald-400',
    dot: 'bg-emerald-500',
  },
] as const;

// ─── Component ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, fetchMe, logout } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleStatus, setGoogleStatus] = useState<{ google_connected: boolean; google_email: string | null }>({
    google_connected: false,
    google_email: null,
  });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile edit state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [saving, setSaving] = useState(false);

  // Notification preferences state
  const [emailPrefs, setEmailPrefs] = useState<PrefMap>({});
  const [prefLoaded, setPrefLoaded] = useState(false);
  const [togglingType, setTogglingType] = useState<string | null>(null);

  // Sign-out confirmation
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    fetchGoogleStatus();
    fetchNotifPrefs();

    // Handle redirect back from Google OAuth
    const connected = searchParams.get('google_connected');
    const googleEmail = searchParams.get('google_email');
    const error = searchParams.get('google_error');

    if (connected === 'true') {
      showToast('success', `Google Calendar connected${googleEmail ? ` (${googleEmail})` : ''}!`);
      setSearchParams({});
      fetchGoogleStatus();
      fetchMe();
    } else if (error) {
      showToast('error', 'Failed to connect Google Calendar. Please try again.');
      setSearchParams({});
    }
  }, []);

  const fetchNotifPrefs = async () => {
    try {
      const res = await api.get('/api/notifications/preferences');
      setEmailPrefs(res.data);
    } catch { /* silently ignore — UI still renders with defaults */ }
    setPrefLoaded(true);
  };

  const toggleEmailPref = async (type: string) => {
    const newVal = !emailPrefs[type];
    // Optimistic update
    setEmailPrefs(prev => ({ ...prev, [type]: newVal }));
    setTogglingType(type);
    try {
      await api.put('/api/notifications/preferences', { [type]: newVal });
    } catch {
      // Revert on failure
      setEmailPrefs(prev => ({ ...prev, [type]: !newVal }));
      showToast('error', 'Failed to update preference. Please try again.');
    }
    setTogglingType(null);
  };

  const fetchGoogleStatus = async () => {
    try {
      const res = await api.get('/api/auth/google/status');
      setGoogleStatus(res.data);
    } catch { }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const res = await api.get('/api/auth/google/connect');
      // Redirect to Google's auth page
      window.location.href = res.data.auth_url;
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Could not start Google connection');
      setConnecting(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect your Google Calendar? Existing synced events will remain in Google Calendar.')) return;
    setDisconnecting(true);
    try {
      await api.post('/api/auth/google/disconnect');
      setGoogleStatus({ google_connected: false, google_email: null });
      showToast('success', 'Google Calendar disconnected.');
    } catch { }
    setDisconnecting(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/api/users/me', { full_name: fullName });
      await fetchMe();
      showToast('success', 'Profile updated.');
    } catch {
      showToast('error', 'Failed to save profile.');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account and integrations</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 p-4 rounded-xl border text-sm ${
          toast.type === 'success'
            ? 'bg-green-600/15 border-green-500/30 text-green-300'
            : 'bg-red-600/15 border-red-500/30 text-red-300'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Profile */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Update your display name</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="opacity-60" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={user?.department || ''} disabled className="opacity-60" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={user?.role || ''} disabled className="opacity-60 capitalize" />
            </div>
          </div>
          <Button size="sm" onClick={saveProfile} disabled={saving || fullName === user?.full_name}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Google Calendar Integration */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Google Calendar Integration
          </CardTitle>
          <CardDescription>
            Connect your personal Google Calendar to automatically sync SyncSpace meetings.
            When a meeting is created or updated, it will appear in your Google Calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleStatus.google_connected ? (
            <div className="space-y-4">
              {/* Connected state */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-green-600/10 border border-green-500/30">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-300">Google Calendar Connected</p>
                  {googleStatus.google_email && (
                    <p className="text-xs text-green-400/70 mt-0.5">{googleStatus.google_email}</p>
                  )}
                </div>
                <Badge variant="success" className="shrink-0">Active</Badge>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  New meetings you create sync to your Google Calendar
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  Meeting invitations appear with attendee details
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  Cancellations remove events from your calendar
                </p>
              </div>

              <Separator />

              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-400 border-red-500/30 hover:bg-red-600/10"
                onClick={disconnectGoogle}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Disconnect Google Calendar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Disconnected state */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
                  <GoogleCalendarIcon />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Google Calendar</p>
                  <p className="text-xs text-muted-foreground">Not connected</p>
                </div>
                <Badge variant="secondary" className="shrink-0">Disconnected</Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Connect your Google account to automatically add SyncSpace meetings to your personal Google Calendar.
                You'll be redirected to Google to grant calendar permissions.
              </p>

              <Button
                onClick={connectGoogle}
                disabled={connecting}
                className="gap-2 bg-white text-gray-900 hover:bg-gray-100"
              >
                {connecting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <GoogleCalendarIcon className="w-4 h-4" />}
                {connecting ? 'Redirecting to Google...' : 'Connect Google Calendar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-400" />
            Notifications
          </CardTitle>
          <CardDescription>
            In-app notifications are always enabled. Choose which types also send you an email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Header row */}
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Notification type
            </span>
            <div className="flex items-center gap-6 pr-0.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-14 text-center">
                In-app
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-14 text-center">
                Email
              </span>
            </div>
          </div>

          {NOTIF_TYPES.map(({ type, label, description, Icon, color, dot }) => {
            const emailOn = !!emailPrefs[type];
            const isToggling = togglingType === type;

            return (
              <div
                key={type}
                className="flex items-center justify-between py-3 rounded-lg px-1 hover:bg-white/[0.02] transition-colors group"
              >
                {/* Left: icon + text */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 shrink-0 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5 max-w-sm">
                      {description}
                    </p>
                  </div>
                </div>

                {/* Right: toggles */}
                <div className="flex items-center gap-6 shrink-0 ml-4 pr-0.5">
                  {/* In-app — always on, not interactive */}
                  <div className="w-14 flex justify-center">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                    </div>
                  </div>

                  {/* Email toggle */}
                  <div className="w-14 flex justify-center">
                    {!prefLoaded ? (
                      <div className="w-9 h-5 rounded-full bg-white/10 animate-pulse" />
                    ) : (
                      <button
                        onClick={() => toggleEmailPref(type)}
                        disabled={isToggling}
                        title={emailOn ? 'Email notifications on — click to disable' : 'Email notifications off — click to enable'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${
                          emailOn ? 'bg-blue-600' : 'bg-white/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            emailOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer note */}
          <p className="pt-3 text-xs text-muted-foreground border-t border-white/5 mt-1">
            Email notifications require the system email to be configured by an administrator.
          </p>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="border-white/10 border-red-500/10">
        <CardHeader>
          <CardTitle className="text-base text-red-400">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="ghost"
            className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-600/10"
            onClick={() => setShowSignOutConfirm(true)}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* ── Sign-out confirmation overlay ───────────────────────────────────── */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="bg-[#0f1729] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <LogOut className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Sign out of SyncSpace?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You'll be signed out and redirected to the login page. Any unsaved changes will be lost.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 hover:bg-white/5"
                onClick={() => setShowSignOutConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-500 text-white gap-2 border-0"
                onClick={() => { logout(); setShowSignOutConfirm(false); }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleCalendarIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="36" height="36" rx="4" fill="white" stroke="#e0e0e0" />
      <rect x="6" y="6" width="36" height="10" rx="4" fill="#4285F4" />
      <rect x="6" y="12" width="36" height="4" fill="#4285F4" />
      <text x="24" y="34" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#4285F4">G</text>
    </svg>
  );
}
