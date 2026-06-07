// Base URL for the submission / profile / export worker API.
//
// Default is empty — i.e. **same-origin**: the reverse proxy routes `/api/*` on
// this site's domain to the worker, so requests are relative (`/api/me`) and the
// browser never issues a CORS preflight.
//
// Override with VITE_SUBMIT_API to point at an absolute host (e.g. for local dev
// against the deployed worker, or a separate API subdomain).
export const API_BASE = (import.meta.env.VITE_SUBMIT_API ?? '').replace(/\/$/, '');
