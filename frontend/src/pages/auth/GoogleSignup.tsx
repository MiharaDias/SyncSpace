import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Mail, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useDepartmentsStore } from '../../lib/departments';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

interface Invite {
  email: string;
  role: string;
  departments: string[];
}

/**
 * Handles /google-signup?temp=<token>&email=<email>&name=<name>
 *
 * Two modes:
 *  - Invite mode: localStorage has 'syncspace_invite_token' → role & departments
 *    are locked from the invitation; user gets immediate access (pre-approved).
 *  - Normal mode: user chooses departments + role; account awaits approval.
 */
export default function GoogleSignup() {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const { departments: allDepartments, fetch: fetchDepts } = useDepartmentsStore();

  const params = new URLSearchParams(window.location.search);
  const tempToken    = params.get('temp')  || '';
  const prefillEmail = params.get('email') || '';
  const prefillName  = params.get('name')  || '';

  // ── Invite state ───────────────────────────────────────────────────────────
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invite, setInvite]           = useState<Invite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);

  // ── Form state (used in non-invite mode) ──────────────────────────────────
  const [form, setForm]           = useState({ role: 'user' });
  const [departments, setDepartments] = useState<string[]>([]);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  // Check for stored invite token on mount
  useEffect(() => {
    const stored = localStorage.getItem('syncspace_invite_token');
    if (!stored) {
      setInviteLoading(false);
      return;
    }
    setInviteToken(stored);
    api.get(`/api/auth/invite/${stored}`)
      .then(res => {
        const inv: Invite = res.data;
        if (!inv.departments?.length && (res.data.department || '')) {
          inv.departments = [res.data.department];
        }
        setInvite(inv);
        // Pre-set departments from invite
        setDepartments(inv.departments || []);
      })
      .catch(() => {
        // Invalid / expired invite token — remove and proceed in normal mode
        localStorage.removeItem('syncspace_invite_token');
        setInviteToken(null);
      })
      .finally(() => setInviteLoading(false));
  }, []);

  const toggleDept = (d: string) =>
    setDepartments(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!tempToken) {
      setError('Invalid session — please try signing in again.');
      return;
    }
    const effectiveDepts = invite ? (invite.departments || []) : departments;
    if (effectiveDepts.length === 0) {
      setError('Please select at least one department.');
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        temp_token:  tempToken,
        role:        invite ? invite.role : form.role,
        departments: effectiveDepts,
        department:  effectiveDepts[0],
      };
      if (inviteToken) payload.invitation_token = inviteToken;

      const res = await api.post('/api/auth/google/complete-signup', payload);

      // Clean up stored invite token
      if (inviteToken) localStorage.removeItem('syncspace_invite_token');

      if (res.data.token) {
        setToken(res.data.token);
        setUser(res.data.user);
        navigate('/dashboard', { replace: true });
      } else {
        // Pending approval (non-invite path)
        navigate('/login?registered=1', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed — please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!tempToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4">
        <Card className="w-full max-w-md border-white/10 bg-white/5">
          <CardContent className="pt-6 text-center">
            <p className="text-red-400 mb-4">Invalid or expired signup link.</p>
            <Button variant="outline" onClick={() => navigate('/login')}>Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {invite ? 'Almost there!' : 'Complete Your Profile'}
            </h1>
            <p className="text-blue-300 text-sm">
              {invite ? 'Your account is ready — just confirm to continue' : 'Just a few more details to get started'}
            </p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Welcome to SyncSpace!</CardTitle>
            <CardDescription>
              Signing in as <span className="text-blue-300">{prefillEmail}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Google profile info — always shown */}
              <div className="p-3 rounded-lg bg-blue-600/10 border border-blue-500/20 space-y-1">
                <p className="text-xs text-blue-300 font-medium">From Google</p>
                <p className="text-sm text-white">{prefillName}</p>
                <p className="text-xs text-muted-foreground">{prefillEmail}</p>
              </div>

              {inviteLoading ? (
                /* Skeleton while checking localStorage for invite */
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                  <div className="h-16 bg-white/5 rounded-lg animate-pulse" />
                </div>
              ) : invite ? (
                /* ── INVITE MODE: locked role + departments ──────────────────── */
                <div className="space-y-3 p-4 rounded-xl bg-blue-600/8 border border-blue-500/20">
                  <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Pre-configured by your administrator
                  </p>

                  <div className="flex items-center gap-2.5">
                    <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-sm text-white">{invite.email}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-blue-300 min-w-[4.5rem]">Role:</span>
                    <span className="px-2.5 py-0.5 text-xs rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-200 font-medium capitalize">
                      {invite.role}
                    </span>
                  </div>

                  {invite.departments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-blue-300 min-w-[4.5rem]">
                        {invite.departments.length === 1 ? 'Department:' : 'Departments:'}
                      </span>
                      {invite.departments.map(d => (
                        <span
                          key={d}
                          className="px-2.5 py-0.5 text-xs rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-200"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* ── NORMAL MODE: department + role selectors ────────────────── */
                <>
                  <div className="space-y-2">
                    <Label>
                      Departments <span className="text-muted-foreground text-xs">(select all that apply)</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg border border-white/10 bg-white/5 max-h-48 overflow-y-auto">
                      {allDepartments.map(d => (
                        <label key={d} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={departments.includes(d)}
                            onChange={() => toggleDept(d)}
                            className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                          />
                          <span className={`text-sm transition-colors ${departments.includes(d) ? 'text-white' : 'text-muted-foreground group-hover:text-white'}`}>
                            {d}
                          </span>
                        </label>
                      ))}
                    </div>
                    {departments.length > 0 && (
                      <p className="text-xs text-blue-400">Selected: {departments.join(', ')}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={v => {
                      setForm({ ...form, role: v });
                      if (v === 'administrator') setDepartments([...allDepartments]);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="administrator">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || inviteLoading || (!invite && departments.length === 0)}
              >
                {loading ? 'Setting up your account…' : invite ? 'Finish & Enter SyncSpace' : 'Finish Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
