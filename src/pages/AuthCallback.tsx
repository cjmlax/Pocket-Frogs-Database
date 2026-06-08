import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';

// Landing route for the OIDC redirect. AuthProvider processes the ?code in the
// URL automatically; once authenticated we navigate home via React Router (not a
// raw history change) so the SPA actually leaves this view.
export default function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) navigate('/', { replace: true });
  }, [auth.isAuthenticated, navigate]);

  if (auth.error) return <p className="search-error">Sign-in failed: {auth.error.message}</p>;
  return <p className="search-hint">Signing you in…</p>;
}
