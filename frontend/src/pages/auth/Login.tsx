import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Eye, EyeOff } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [googleOnly, setGoogleOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Show google error from redirect
  const params = new URLSearchParams(window.location.search);
  const googleError = params.get('google_error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(false);
    setGoogleOnly(false);
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', form);
      setToken(res.data.token);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      const data = err.response?.data || {};
      if (data.pending) {
        setPending(true);
      } else if (data.google_only) {
        setGoogleOnly(true);
      } else {
        setError(data.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const res = await api.get('/api/auth/google/signin');
      window.location.href = res.data.auth_url;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in unavailable');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1a] px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">SyncSpace</h1>
            <p className="text-blue-300 text-sm">Enterprise Meeting Platform</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials or use Google</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google error from redirect */}
            {googleError && (
              <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">
                {googleError === 'pending_approval'
                  ? 'Your account is pending administrator approval.'
                  : googleError === 'account_deactivated'
                  ? 'Your account has been deactivated.'
                  : 'Google sign-in failed. Please try again.'}
              </div>
            )}
            {pending && (
              <div className="p-3 rounded-lg bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 text-sm">
                Your account is pending administrator approval.
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Google-only account banner — shown when someone tries email/password on a Google account */}
            {googleOnly && (
              <div className="p-3 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 text-sm space-y-2">
                <p className="font-medium">This account uses Google Sign-In.</p>
                <p className="text-blue-300 text-xs">
                  No password is set for <span className="text-white font-medium">{form.email}</span>.
                  Use the button below to sign in with Google.
                </p>
              </div>
            )}

            {/* Google Sign In */}
            <Button
              type="button"
              variant="outline"
              className={`w-full gap-2 bg-white text-gray-900 hover:bg-gray-100 border-white transition-all ${
                googleOnly ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-[#070d1a] scale-[1.02]' : ''
              }`}
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : <GoogleIcon />}
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email" type="email" placeholder="you@company.com"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium">Register</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
