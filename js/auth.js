// Google sign-in with the OAuth 2.0 redirect flow for browser apps.
// A full-page redirect (instead of a popup) works the same in a browser tab,
// an installed Windows app and an iPhone home-screen app. Tokens last one hour;
// renewing is silent (prompt=none) once you've said yes the first time.
import { CONFIG } from '../config.js';
import { load, save } from './store.js';

export const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.modify',      // read, label, archive, send (never permanent delete)
  'https://www.googleapis.com/auth/calendar.events',   // read + edit events
  'https://www.googleapis.com/auth/calendar.readonly', // list your calendars
  'https://www.googleapis.com/auth/tasks',             // Google Tasks
  'https://www.googleapis.com/auth/drive.appdata'      // hidden app folder for synced notes
];

export class AuthError extends Error {
  constructor(msg = 'Your Google session ended. Reconnect to load fresh data.') { super(msg); this.name = 'AuthError'; }
}

export const clientId = () => CONFIG.googleClientId || load('googleClientId', '');

// Page the user comes back to: the app root, without index.html or the #route.
export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

export function getToken() {
  const t = load('gtoken');
  return t && t.exp > Date.now() ? t.token : null;
}
export const hasSignedIn = () => !!load('gaccount');
export const account = () => load('gaccount');
export const grantedScopes = () => (load('gtoken')?.scope || '').split(' ');
export const hasScope = (s) => grantedScopes().includes(s);

export function signIn({ silent = false } = {}) {
  const id = clientId();
  if (!id) throw new Error('Add your Google OAuth client ID in Settings first.');
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem('oauth', JSON.stringify({ state, route: location.hash || '#/today', silent }));
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
    prompt: silent ? 'none' : 'consent'
  });
  const hint = account()?.email;
  if (hint) p.set('login_hint', hint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

// Called once at startup. Returns an error message to show, or null.
export function handleRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const p = new URLSearchParams(hash);
  let pending = {};
  try { pending = JSON.parse(sessionStorage.getItem('oauth') || '{}'); } catch { /* ignore */ }
  sessionStorage.removeItem('oauth');
  history.replaceState(null, '', redirectUri() + (pending.route || '#/today'));

  if (!pending.state || p.get('state') !== pending.state) return 'Sign-in response did not match this app. Please try again.';
  const error = p.get('error');
  if (error) {
    // Silent renew needs a fresh "yes" (new scopes, or signed out of Google): ask properly.
    if (pending.silent && /interaction_required|login_required|consent_required/.test(error)) {
      signIn({ silent: false });
      return null;
    }
    return error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed: ${error}`;
  }
  save('gtoken', {
    token: p.get('access_token'),
    exp: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 - 60_000,
    scope: p.get('scope') || ''
  });
  return null;
}

export async function signOut() {
  const t = load('gtoken')?.token;
  save('gtoken', null);
  save('gaccount', null);
  if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {});
}
