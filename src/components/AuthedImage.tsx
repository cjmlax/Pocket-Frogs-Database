import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { fetchImageObjectUrl } from '../api/adminSubmissions';

// Renders an admin-gated image by fetching it with the bearer token and using an
// object URL — a plain <img src> can't send the Authorization header. The object
// URL is revoked on unmount / url change. `bust` forces a re-fetch (e.g. after a crop).
export default function AuthedImage({
  url, className, alt, bust,
}: { url: string; className?: string; alt?: string; bust?: unknown }) {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken) return;
    let active = true;
    let objectUrl: string | null = null;
    fetchImageObjectUrl(idToken, url)
      .then(u => { if (active) { objectUrl = u; setSrc(u); } else { URL.revokeObjectURL(u); } })
      .catch(() => { if (active) setSrc(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, idToken, bust]);

  if (!src) return <span className={className} aria-hidden />;
  return <img className={className} src={src} alt={alt ?? ''} />;
}
