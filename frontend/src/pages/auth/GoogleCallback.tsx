import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';

/**
 * Handles the Google Sign-In redirect:
 *   /auth/google-callback?token=<jwt>
 *
 * The backend already verified the OAuth code, created / looked up the user,
 * and issued a JWT.  We just need to hydrate the auth store and redirect.
 */
export default function GoogleCallback() {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      navigate('/login?google_error=no_token', { replace: true });
      return;
    }

    // Store the token first so the API interceptor can attach it
    setToken(token);

    api.get('/api/auth/me')
      .then(res => {
        setUser(res.data);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        setToken(null);
        navigate('/login?google_error=profile_fetch_failed', { replace: true });
      });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1a]">
      <div className="text-center space-y-4">
        <svg className="w-10 h-10 animate-spin mx-auto text-blue-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-white text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
