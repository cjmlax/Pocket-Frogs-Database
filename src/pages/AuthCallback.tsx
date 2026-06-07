import { useAuth } from 'react-oidc-context';

// Landing route for the OIDC redirect. AuthProvider processes the ?code in the
// URL automatically on mount; onSigninCallback then sends the user home. This
// just shows status during that brief moment (or any error).
export default function AuthCallback() {
  const auth = useAuth();
  if (auth.error) return <p className="search-error">Sign-in failed: {auth.error.message}</p>;
  return <p className="search-hint">Signing you in…</p>;
}
