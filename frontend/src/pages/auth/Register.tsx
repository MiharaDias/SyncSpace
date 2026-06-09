import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Calendar, Eye, EyeOff, Loader2, Mail, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import { useDepartmentsStore } from '../../lib/departments';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

// ─── Google logo icon ─────────────────────────────────────────────────────────
function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Invitation type ──────────────────────────────────────────────────────────
interface Invitation {
  email: string;
  role: string;
  department: string;
  departments: string[];
}

export default function Register() {
  const navigate = useNavigate();
  const { token: inviteToken } = useParams<{ token?: string }>();

  const { departments, fetch: fetchDepts } = useDepartmentsStore();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invError, setInvError] = useState('');
  const [invLoading, setInvLoading] = useState(false);

  // Regular-register form state (only used when no inviteToken)
  const [form, setForm] = useState({
    full_name: '', username: '', email: '', password: '', role: 'user',
  });
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  // Load invitation data if we have a token
  useEffect(() => {
    if (!inviteToken) return;
    setInvLoading(true);
    api.get(`/api/auth/invite/${inviteToken}`)
      .then(res => {
        const inv: Invitation = res.data;
        // Ensure departments array is populated
        if (!inv.departments?.length && inv.department) {
          inv.departments = [inv.department];
        }
        setInvitation(inv);
      })
      .catch(err => {
        setInvError(err.response?.data?.error || 'Invitation not found or expired');
      })
      .finally(() => setInvLoading(false));
  }, [inviteToken]);

  // Auto-select all departments for admins (regular register only)
  useEffect(() => {
    if (!inviteToken && form.role === 'administrator' && departments.length > 0) {
      setSelectedDepts([...departments]);
    }
  }, [form.role, departments, inviteToken]);

  // ── Google sign-up handler for invite flow ────────────────────────────────
  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      // Store token so GoogleSignup.tsx can pick it up after the OAuth round-trip
      localStorage.setItem('syncspace_invite_token', inviteToken!);
      const res = await api.get('/api/auth/google/signin');
      window.location.href = res.data.auth_url;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in unavailable. Please try again.');
      setLoading(false);
    }
  };

  // ── Regular form helpers ──────────────────────────────────────────────────
  const toggleDept = (d: string) =>
    setSelectedDepts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (selectedDepts.length === 0) {
      setError('Please select at least one department.');
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        departments: selectedDepts,
        department: selectedDepts[0],
      };
      const res = await api.post('/api/auth/register', payload);
      if (res.data.token) {
        useAuthStore.getState().setToken(res.data.token);
        useAuthStore.getState().setUser(res.data.user);
        navigate('/dashboard');
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state while fetching invitation ──────────────────────────────
  if (inviteToken && invLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a]">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // ── Invalid / expired invitation ─────────────────────────────────────────
  if (inviteToken && invError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4">
        <Card className="w-full max-w-md border-white/10 bg-white/5">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-red-400 font-medium">{invError}</p>
            <p className="text-sm text-muted-foreground">
              This invitation link is no longer valid. Please ask your administrator to send a new one.
            </p>
            <Link to="/login"><Button variant="outline" className="w-full">Back to Login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── INVITE FLOW — Google-only acceptance page ────────────────────────────
  if (inviteToken && invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">SyncSpace</h1>
              <p className="text-blue-300 text-sm">You've been invited!</p>
            </div>
          </div>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-4">
              <CardTitle>Accept Your Invitation</CardTitle>
              <CardDescription>
                Sign in with Google to create your SyncSpace account. Your role and departments are
                pre-configured by your administrator.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {/* Pre-configured details — read-only */}
              <div className="space-y-3 p-4 rounded-xl bg-blue-600/8 border border-blue-500/20">
                <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Account details (pre-configured, cannot be changed)
                </p>

                {/* Email */}
                <div className="flex items-center gap-2.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-sm text-white font-medium">{invitation.email}</span>
                </div>

                {/* Role */}
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-blue-300 min-w-[4rem]">Role:</span>
                  <span className="px-2.5 py-0.5 text-xs rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-200 font-medium capitalize">
                    {invitation.role}
                  </span>
                </div>

                {/* Departments */}
                {invitation.departments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-blue-300 min-w-[4rem]">
                      {invitation.departments.length === 1 ? 'Department:' : 'Departments:'}
                    </span>
                    {invitation.departments.map(d => (
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

              {/* Google button */}
              <Button
                onClick={handleGoogleSignup}
                disabled={loading}
                className="w-full gap-2.5 bg-white text-gray-900 hover:bg-gray-100 h-11 text-sm font-semibold"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <GoogleIcon className="w-4 h-4" />}
                {loading ? 'Redirecting to Google…' : 'Continue with Google'}
              </Button>

              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                You'll be redirected to Google to sign in. Make sure to use the Google account
                you want to associate with SyncSpace.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Pending approval screen (regular register) ───────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4">
        <Card className="w-full max-w-md border-white/10 bg-white/5">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-yellow-600/20 border border-yellow-500/30 flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7 text-yellow-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Registration Submitted</h2>
            <p className="text-muted-foreground text-sm">
              Your account is pending administrator approval. You'll be notified once approved.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full mt-2">Back to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── REGULAR REGISTER FORM (no invite token) ───────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">SyncSpace</h1>
            <p className="text-blue-300 text-sm">Create your account</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Register</CardTitle>
            <CardDescription>Fill in your details to request access</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="John Doe" value={form.full_name}
                    onChange={e => setForm({ ...form, full_name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input placeholder="johndoe" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="john@company.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} placeholder="Min 8 chars"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Departments <span className="text-muted-foreground text-xs">(select all that apply)</span>
                </Label>
                <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg border border-white/10 bg-white/5 max-h-48 overflow-y-auto">
                  {departments.map(d => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={selectedDepts.includes(d)} onChange={() => toggleDept(d)}
                        className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer" />
                      <span className={`text-sm transition-colors ${selectedDepts.includes(d) ? 'text-white' : 'text-muted-foreground group-hover:text-white'}`}>
                        {d}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedDepts.length > 0 && (
                  <p className="text-xs text-blue-400">Selected: {selectedDepts.join(', ')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => {
                  setForm({ ...form, role: v });
                  if (v === 'administrator') setSelectedDepts([...departments]);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={loading || selectedDepts.length === 0}>
                {loading ? 'Submitting…' : 'Request Access'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
