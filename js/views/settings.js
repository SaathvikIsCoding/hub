// Settings: connect Google + GitHub, notifications, install the app, setup guide.
import { h, clear, panel, btn, toast } from '../ui.js';
import { load, save, clearAll } from '../store.js';
import { CONFIG } from '../../config.js';
import * as A from '../auth.js';
import { ghUser, ghToken } from '../github.js';

const SCOPE_NAMES = {
  'https://www.googleapis.com/auth/gmail.modify': 'Gmail',
  'https://www.googleapis.com/auth/calendar.events': 'Calendar events',
  'https://www.googleapis.com/auth/calendar.readonly': 'Calendar list',
  'https://www.googleapis.com/auth/tasks': 'Tasks',
  'https://www.googleapis.com/auth/drive.appdata': 'Notes sync (Drive app folder)'
};

export function render(root, ctx) {
  const acct = A.account();
  const signedIn = !!A.getToken();
  const missing = signedIn ? Object.keys(SCOPE_NAMES).filter((s) => !A.hasScope(s)) : [];

  const clientInput = h('input', { type: 'text', value: A.clientId(), placeholder: '1234-abc.apps.googleusercontent.com', autocomplete: 'off', spellcheck: 'false' });
  const ghUserInput = h('input', { type: 'text', value: ghUser(), autocomplete: 'off' });
  const ghTokenInput = h('input', { type: 'password', value: ghToken(), placeholder: 'ghp_…', autocomplete: 'off' });

  clear(root,
    h('div', { class: 'page-head' }, h('p', { class: 'pixel-label' }, 'OPTIONS'), h('h1', { class: 'page-title' }, 'Settings')),

    panel('Google', { meta: signedIn ? 'Connected' : acct ? 'Session ended' : 'Not connected' },
      acct ? h('div', { class: 'account' },
        acct.picture ? h('img', { src: acct.picture, alt: '', width: 40, height: 40, referrerpolicy: 'no-referrer' }) : null,
        h('div', {}, h('strong', {}, acct.name), h('div', { class: 'row-meta' }, acct.email))) : null,
      missing.length ? h('p', { class: 'warn' }, `Not allowed yet: ${missing.map((s) => SCOPE_NAMES[s]).join(', ')}. Reconnect and tick every box.`) : null,
      CONFIG.googleClientId ? null : h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'OAuth client ID'), clientInput,
        h('span', { class: 'field-hint' }, 'From Google Cloud (see the setup guide below). Saved on this device only.')),
      h('div', { class: 'form-actions form-actions-left' },
        btn(acct ? 'Reconnect Google' : 'Connect Google', () => {
          if (!CONFIG.googleClientId) save('googleClientId', clientInput.value.trim());
          try { A.signIn(); } catch (err) { toast(err.message); }
        }, 'btn-primary'),
        acct ? btn('Sign out', async () => { await A.signOut(); toast('Signed out of Google'); ctx.refresh(); }) : null)),

    panel('GitHub', {},
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Username'), ghUserInput),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Personal access token (optional)'), ghTokenInput,
        h('span', { class: 'field-hint' },
          'Adds notifications and deploy status. ',
          h('a', { href: 'https://github.com/settings/tokens/new?scopes=notifications,read:user&description=Hub%20dashboard', target: '_blank', rel: 'noopener' }, 'Create a classic token'),
          ' with only "notifications" and "read:user". Stored on this device only.')),
      h('div', { class: 'form-actions form-actions-left' }, btn('Save GitHub', () => {
        save('githubUser', ghUserInput.value.trim() || null);
        save('githubToken', ghTokenInput.value.trim() || null);
        toast('GitHub settings saved');
      }, 'btn-primary'))),

    panel('Reminders', {},
      h('p', {}, 'Get a notification 10 minutes before each event, and when a focus timer ends, while the app is open (or installed and running in the background on Windows).'),
      h('div', { class: 'form-actions form-actions-left' },
        'Notification' in window
          ? (Notification.permission === 'granted'
            ? h('span', { class: 'tag tag-accent' }, 'ON')
            : btn('Turn on notifications', async () => { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications on' : 'Notifications blocked'); ctx.refresh(); }, 'btn-primary'))
          : h('span', { class: 'row-meta' }, 'On iPhone, install the app to the home screen first (iOS 16.4 or later), then turn this on.'))),

    panel('Install as an app', {},
      ctx.installPrompt ? btn('Install Hub on this device', () => ctx.install(), 'btn-primary') : null,
      h('ul', { class: 'steps' },
        h('li', {}, h('strong', {}, 'Windows: '), 'open the site in Edge or Chrome, click the install icon in the address bar (or menu > Apps > Install). It gets its own window, Start-menu entry and taskbar icon. In edge://apps you can set it to start when you sign in.'),
        h('li', {}, h('strong', {}, 'iPhone: '), 'open the site in Safari, tap Share > Add to Home Screen > Add. It opens full-screen like a normal app.'),
        h('li', {}, h('strong', {}, 'Android: '), 'Chrome menu > Install app.'))),

    panel('Google setup guide (one time, about 10 minutes)', {},
      h('ol', { class: 'steps' },
        h('li', {}, 'Go to ', h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'console.cloud.google.com'), ' and create a project called "Hub".'),
        h('li', {}, 'APIs & Services > Library: enable ', h('strong', {}, 'Gmail API, Google Calendar API, Google Tasks API, Google Drive API'), '.'),
        h('li', {}, 'Google Auth Platform (OAuth consent screen): User type ', h('strong', {}, 'External'), ', app name "Hub", your email. Under Audience > Test users, add ', h('strong', {}, acct?.email || 'your Gmail address'), '.'),
        h('li', {}, 'Clients > Create client > ', h('strong', {}, 'Web application'), '. Add these:'),
        h('li', { class: 'no-num' },
          h('p', { class: 'field-label' }, 'Authorized JavaScript origins'),
          h('code', { class: 'copy' }, 'https://saathvikiscoding.github.io'), h('code', { class: 'copy' }, 'http://localhost:5174'),
          h('p', { class: 'field-label' }, 'Authorized redirect URIs'),
          h('code', { class: 'copy' }, 'https://saathvikiscoding.github.io/hub/'), h('code', { class: 'copy' }, 'http://localhost:5174/')),
        h('li', {}, 'Copy the Client ID into the box above and press Connect Google. Google will warn that the app is unverified: it is your own app, so choose Advanced > Go to Hub.'))),

    panel('This device', {},
      h('p', { class: 'row-meta' }, 'Cached mail, events and tasks are kept on this device so the app opens instantly and works offline.'),
      h('div', { class: 'form-actions form-actions-left' }, btn('Clear data on this device', () => {
        if (!confirm('Clear cached data, tokens and settings on this device? Your Google and GitHub data is not touched.')) return;
        clearAll();
        toast('Cleared');
        ctx.refresh();
      }, 'btn-danger'))));

  root.querySelectorAll('code.copy').forEach((c) => {
    c.title = 'Click to copy';
    c.addEventListener('click', () => navigator.clipboard.writeText(c.textContent).then(() => toast('Copied')));
  });
}
