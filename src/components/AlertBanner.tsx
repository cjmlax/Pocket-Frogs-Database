import { useQuery } from '@tanstack/react-query';
import { fetchActiveAlerts } from '../api/alerts';
import { useDismissedAlerts } from '../hooks/useDismissedAlerts';

// Site-wide announcement banners (maintenance, known-broken features, etc.),
// posted from the admin Site Alerts page. Each is dismissable per-browser via
// localStorage, keyed by alert id — editing an alert's message does not reset
// dismissals for users who already saw it, since the id is stable.
export default function AlertBanner() {
  const { data: alerts } = useQuery({
    queryKey: ['site-alerts'],
    queryFn: fetchActiveAlerts,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const { dismissed, dismiss } = useDismissedAlerts();

  const visible = (alerts ?? []).filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="alert-banner-stack">
      {visible.map(a => (
        <div key={a.id} className={`alert-banner alert-banner-${a.level}`} role="alert">
          <span className="alert-banner-message">{a.message}</span>
          <button
            className="alert-banner-dismiss"
            aria-label="Dismiss alert"
            onClick={() => dismiss(a.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
