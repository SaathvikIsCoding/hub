// App shell: routing, Google session, nav badges, reminders, shortcuts, install.
import { h, clear, $, toast, modal, closeModal, btn } from './ui.js';
import * as A from './auth.js';
import * as G from './google.js';
import * as GH from './github.js';
import { load, save, cached } from './store.js';
import { notify } from './views/focus.js';
import { CONFIG } from '../config.js';

const ROUTES = {
  today: { label: 'Today', icon: 'T', load: () => import('./views/today.js') },
  mail: { label: 'Mail', icon: 'M', load: () => import('./views/mail.js') },
  calendar: { label: 'Calendar', icon: 'C', load: () => import('./views/calendar.js') },
  tasks: { label: 'Tasks', icon: 'K', load: () => import('./views/tasks.js') },
  jams: { label: 'Jams', icon: 'J', load: () => import('./views/jams.js') },
  notes: { label: 'Notes', icon: 'N', load: () => import('./views/notes.js') },
  updates: { label: 'Updates', icon: 'U', load: () => import('./views/updates.js') },
  portfolio: { label: 'Portfolio', icon: 'P', load: () => import('./views/portfolio.js') },
  settings: { label: 'Settings', icon: 'S', load: () => import('./views/settings.js') },
  more: { label: 'More', icon: '+', hidden: true }
};
const MOBILE_TABS = ['today', 'mail', 'calendar', 'tasks', 'more'];

const badges = load('badges', {});
let installPrompt = null;
let renderSeq = 0;

// ---------- Context passed to every view ----------

const ctx = {
  get account() { return A.account(); },
  get installPrompt() { return installPrompt; },
  refresh: () => route(),
  navigate: (name) => { location.hash = `#/${name}`; },
  signInPrompt() {
    const hasId = !!A.clientId();
    return h('div', { class: 'connect' },
      h('p', {}, A.hasSignedIn() ? 'Your Google session ended.' : 'Connect your Google account to see mail, calendar and tasks here.'),
      hasId
        ? btn(A.hasSignedIn() ? 'Reconnect' : 'Connect Google', () => A.signIn({ silent: A.hasSignedIn() }), 'btn-primary')
        : h('a', { class: 'btn btn-primary', href: '#/settings' }, 'Set up Google'));
  },
  // Returns true when the error was fully handled (toast shown); inline callers
  // get false so they can draw an error box in place.
  handleError(err, inline = false) {
    console.error(err);
    if (err?.name === 'AuthError') showBanner();
    if (inline) return false;
    toast(err?.message || String(err));
    return true;
  },
  setBadge(name, n) {
    badges[name] = n || 0;
    save('badges', badges);
    drawBadges();
  },
  async install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  }
};

// ---------- Shell ----------

function navItem(name, cls) {
  const r = ROUTES[name];
  return h('a', { class: cls, href: `#/${name}`, dataset: { route: name } },
    h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, r.icon),
    h('span', { class: 'nav-label' }, r.label),
    h('span', { class: 'badge', dataset: { badge: name }, hidden: true }));
}

function buildShell() {
  clear($('#sidebar-nav'), Object.keys(ROUTES).filter((k) => !ROUTES[k].hidden).map((k) => navItem(k, 'side-link')));
  clear($('#tabbar'), MOBILE_TABS.map((k) => navItem(k, 'tab-link')));
  $('#refresh').addEventListener('click', () => { route(); updateBadges(); });
  $('#palette-btn').addEventListener('click', openPalette);
  drawBadges();
}

function drawBadges() {
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const n = el.dataset.badge === 'more' ? (badges.updates || 0) : badges[el.dataset.badge] || 0;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : n;
  });
  const appBadge = (badges.mail || 0) + (badges.updates || 0);
  try { appBadge ? navigator.setAppBadge?.(appBadge) : navigator.clearAppBadge?.(); } catch { /* unsupported */ }
}

function drawAccount() {
  const a = A.account();
  clear($('#account'), a
    ? h('a', { class: 'account-mini', href: '#/settings' },
      a.picture ? h('img', { src: a.picture, alt: '', width: 28, height: 28, referrerpolicy: 'no-referrer' }) : null,
      h('span', {}, a.email))
    : h('a', { class: 'account-mini', href: '#/settings' }, 'Not connected'));
}

function showBanner() {
  const el = $('#banner');
  if (!A.clientId()) {
    clear(el, h('span', {}, 'Finish the one-time Google setup to load your mail, calendar and tasks.'), h('a', { class: 'btn btn-small btn-primary', href: '#/settings' }, 'Set up'));
  } else {
    clear(el, h('span', {}, A.hasSignedIn() ? 'Google session ended (they last an hour).' : 'Google is not connected.'),
      btn(A.hasSignedIn() ? 'Reconnect' : 'Connect', () => A.signIn({ silent: A.hasSignedIn() }), 'btn-small btn-primary'));
  }
  el.hidden = false;
}

// ---------- Router ----------

async function route() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'today';
  const r = ROUTES[name] || ROUTES.today;
  const key = ROUTES[name] ? name : 'today';
  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === key || (a.classList.contains('tab-link') && a.dataset.route === 'more' && !MOBILE_TABS.includes(key));
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${r.label} | Hub`;
  if (A.getToken()) $('#banner').hidden = true;
  else showBanner();

  const view = $('#view');
  const seq = ++renderSeq;
  if (key === 'more') { renderMore(view); return; }
  const mod = await r.load();
  if (seq !== renderSeq) return; // a newer navigation won
  view.replaceChildren();
  mod.render(view, ctx);
  if (location.hash.slice(2) !== key) history.replaceState(null, '', `#/${key}`);
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function renderMore(view) {
  clear(view,
    h('div', { class: 'page-head' }, h('p', { class: 'pixel-label' }, 'MENU'), h('h1', { class: 'page-title' }, 'More')),
    h('nav', { class: 'more-list', 'aria-label': 'More' }, ['jams', 'notes', 'updates', 'portfolio', 'settings'].map((k) => navItem(k, 'more-link'))));
  drawBadges();
}

// ---------- Background: badges + reminders ----------

async function updateBadges() {
  const jobs = [];
  if (A.getToken()) jobs.push(G.inboxCounts().then((c) => ctx.setBadge('mail', c.unread)));
  if (GH.ghToken()) jobs.push(GH.notifications().then((n) => ctx.setBadge('updates', n.length)));
  await Promise.allSettled(jobs);
}

async function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  let events = cached('today-events') || [];
  if (A.getToken()) {
    try { events = await G.listEvents({ from: new Date(), days: 1 }); } catch { /* use cache */ }
  }
  const sent = new Set(load('reminded', []));
  const now = Date.now();
  for (const e of events) {
    const mins = (new Date(e.start) - now) / 60000;
    const id = `${e.id}@${new Date(e.start).getTime()}`;
    if (!e.allDay && mins > 0 && mins <= 10 && !sent.has(id)) {
      notify(`${e.title} in ${Math.ceil(mins)} min${e.location ? `, ${e.location}` : ''}`);
      sent.add(id);
    }
  }
  save('reminded', [...sent].slice(-100));
}

// ---------- Command palette (Ctrl+K) ----------

function openPalette() {
  const commands = [
    ...Object.keys(ROUTES).filter((k) => !ROUTES[k].hidden).map((k) => ({ label: `Go to ${ROUTES[k].label}`, run: () => ctx.navigate(k) })),
    { label: 'Compose email', run: async () => (await import('./views/mail.js')).compose({}, ctx) },
    { label: 'New task', run: () => { ctx.navigate('tasks'); setTimeout(() => $('#view input.search')?.focus(), 300); } },
    { label: 'New event', run: () => { ctx.navigate('calendar'); setTimeout(() => $('#view input.search')?.focus(), 300); } },
    { label: 'Post a jam update', run: () => { ctx.navigate('jams'); setTimeout(() => $('#view .jam-log-input')?.focus(), 300); } },
    { label: 'New note', run: () => { ctx.navigate('notes'); setTimeout(() => $('#view .note-input')?.focus(), 300); } },
    { label: 'Open portfolio site', run: () => window.open(CONFIG.portfolioUrl, '_blank', 'noopener') },
    { label: 'Refresh', run: () => { route(); updateBadges(); } }
  ];
  const input = h('input', { type: 'text', class: 'search', placeholder: 'Type a command, or text to search mail…', 'aria-label': 'Command' });
  const list = h('ul', { class: 'palette-list', role: 'listbox' });
  let active = 0;
  let shown = commands;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = commands.filter((c) => c.label.toLowerCase().includes(q));
    if (q) shown.push({ label: `Search mail for "${input.value.trim()}"`, run: async () => { ctx.navigate('mail'); setTimeout(() => { const s = $('#view input[type=search]'); if (s) { s.value = input.value.trim(); s.form.requestSubmit(); } }, 400); } });
    active = Math.min(active, shown.length - 1);
    clear(list, shown.map((c, i) => h('li', { class: `palette-item ${i === active ? 'is-active' : ''}`, role: 'option', 'aria-selected': String(i === active), onclick: () => { closeModal(); c.run(); } }, c.label)));
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && shown[active]) { closeModal(); shown[active].run(); }
  });
  draw();
  modal('Command', h('div', { class: 'palette' }, input, list));
  input.focus();
}

function shortcuts(e) {
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || $('#modal').open) return;
  const keys = { 1: 'today', 2: 'mail', 3: 'calendar', 4: 'tasks', 5: 'jams', 6: 'notes', 7: 'updates', 8: 'portfolio' };
  if (keys[e.key]) ctx.navigate(keys[e.key]);
  else if (e.key === '/') { const s = $('#view input.search, #view input[type=search]'); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.key === 'c') import('./views/mail.js').then((m) => m.compose({}, ctx));
  else if (e.key === 'r') { route(); updateBadges(); }
}

// ---------- Start ----------

async function start() {
  const err = A.handleRedirect();
  buildShell();
  if (err) toast(err);

  // Previously connected but the hour is up: renew quietly on launch (once per 30 s, so it can't loop).
  const lastTry = Number(sessionStorage.getItem('autoAuth') || 0);
  if (!A.getToken() && A.hasSignedIn() && A.clientId() && Date.now() - lastTry > 30000 && !err) {
    sessionStorage.setItem('autoAuth', String(Date.now()));
    A.signIn({ silent: true });
    return;
  }
  if (A.getToken() && !A.account()) await G.userInfo().catch(() => {});
  drawAccount();
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', shortcuts);
  route();
  updateBadges();
  checkReminders();

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    updateBadges();
    const busy = $('#modal').open || /input|textarea/i.test(document.activeElement?.tagName);
    if (!busy && /^#\/(today)?$/.test(location.hash || '#/')) route();
  }, 5 * 60000);
  setInterval(checkReminders, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!A.getToken() && A.hasSignedIn() && !$('#modal').open) showBanner();
    else updateBadges();
  });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
start();
