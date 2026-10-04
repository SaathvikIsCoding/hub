// Game jams: live countdowns to upload/deadline, submission checklist, progress
// log and links. Synced through the Drive app folder (last edit wins), and
// kept on this device so it works before Google is connected.
import { h, clear, panel, empty, btn, toast, formModal, ago, toLocalInput } from '../ui.js';
import * as G from '../google.js';
import { load, save } from '../store.js';
import { getToken } from '../auth.js';

const FILE = 'hub-jams.json';
const STATUSES = ['Planning', 'In progress', 'Submitted', 'Voting', 'Results'];

// First jam, taken from Last Call's Docs/SUBMISSION.md and CLAUDE.md.
const SEED = {
  updatedAt: 0,
  jams: [{
    id: 'byog-2026',
    name: 'BYOG 2026',
    game: 'Last Call: Everything Is Temporary',
    theme: 'Everything Is Temporary',
    uploadBy: '2026-10-04T16:00:00+05:30',
    deadline: '2026-10-04T18:00:00+05:30',
    status: 'In progress',
    notes: 'Windows 64-bit, keyboard and mouse. Build: Builds/LastCall-Windows.zip in the Unity project.',
    links: [],
    checklist: [
      { id: 'c1', text: 'Fresh Windows build, zipped (the zip is from 3 Oct, 7:49 PM: rebuild if the game changed after that)', done: false },
      { id: 'c2', text: 'Test the zip on a clean Windows account', done: false },
      { id: 'c3', text: 'Page text written (Docs/SUBMISSION.md)', done: true },
      { id: 'c4', text: '6 screenshots + Level 4 GIF ready', done: true },
      { id: 'c5', text: 'Credits complete (Docs/CREDITS.md + in-game screen)', done: true },
      { id: 'c6', text: 'Uploaded to the jam page (aim for 4:00 PM)', done: false },
      { id: 'c7', text: 'Submission confirmed on the jam page', done: false }
    ],
    log: []
  }]
};

const uid = () => crypto.randomUUID().slice(0, 8);
let data = load('jams') || structuredClone(SEED);
let pushTimer;

function commit() {
  data.updatedAt = Date.now();
  save('jams', data);
  if (!getToken()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => G.writeAppFile(FILE, data).catch(() => toast('Jam changes saved on this device; will sync later')), 500);
}

// Pull the synced copy; the newer side wins.
async function pull() {
  if (!getToken()) return false;
  const remote = await G.readAppFile(FILE, null).catch(() => null);
  if (remote && remote.updatedAt > (data.updatedAt || 0)) { data = remote; save('jams', data); return true; }
  if (!remote || remote.updatedAt < data.updatedAt) G.writeAppFile(FILE, data).catch(() => {});
  return false;
}

// ---------- Countdown ----------

export function countdown(iso) {
  if (!iso) return { text: 'No date set', past: false, urgent: false };
  const ms = new Date(iso) - Date.now();
  const past = ms <= 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / 86400000), hh = Math.floor((a % 86400000) / 3600000), mm = Math.floor((a % 3600000) / 60000), ss = Math.floor((a % 60000) / 1000);
  const span = d ? `${d}d ${hh}h ${mm}m` : hh ? `${hh}h ${mm}m ${String(ss).padStart(2, '0')}s` : `${mm}m ${String(ss).padStart(2, '0')}s`;
  return { text: past ? `${span} ago` : span, past, urgent: !past && ms < 3 * 3600000 };
}

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isLive = (j) => !['Results'].includes(j.status) && (!j.deadline || new Date(j.deadline) > Date.now() - 86400000);

function clock(label, iso) {
  const el = h('div', { class: 'jam-clock' });
  const draw = () => {
    const c = countdown(iso);
    clear(el,
      h('span', { class: 'pixel-label' }, label),
      h('span', { class: `jam-time ${c.urgent ? 'is-urgent' : ''} ${c.past ? 'is-past' : ''}` }, iso ? (c.past ? 'CLOSED' : c.text) : '--'),
      iso ? h('span', { class: 'row-meta' }, when(iso), c.past ? `, ${c.text}` : '') : null);
  };
  draw();
  const t = setInterval(() => (el.isConnected ? draw() : clearInterval(t)), 1000);
  return el;
}

const progress = (j) => {
  const done = j.checklist.filter((c) => c.done).length;
  return h('div', { class: 'jam-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': j.checklist.length, 'aria-valuenow': done, 'aria-label': 'Checklist' },
    h('div', { class: 'jam-bar' }, j.checklist.map((c) => h('span', { class: c.done ? 'is-done' : '' }))),
    h('span', { class: 'row-meta' }, `${done}/${j.checklist.length} done`));
};

// ---------- Today panel ----------

export function jamPanel() {
  const live = data.jams.filter(isLive);
  if (!live.length) return null;
  const body = h('div', { class: 'jam-today' }, live.slice(0, 2).map((j) => h('div', { class: 'jam-mini' },
    h('p', { class: 'jam-mini-name' }, h('a', { href: '#/jams' }, j.game || j.name), h('span', { class: 'tag tag-gold' }, j.status.toUpperCase())),
    h('div', { class: 'jam-clocks' },
      j.uploadBy && new Date(j.uploadBy) > Date.now() ? clock('UPLOAD BY', j.uploadBy) : null,
      clock('DEADLINE', j.deadline)),
    progress(j))));
  pull().then((changed) => {
    const p = body.closest('.panel');
    if (changed && p?.isConnected) p.replaceWith(jamPanel() || h('div'));
  }).catch(() => {});
  return panel('Game jam', { action: h('a', { class: 'panel-link', href: '#/jams' }, 'Jams'), cls: 'panel-jam' }, body);
}

// ---------- Jams screen ----------

export function render(root, ctx) {
  const list = h('div');
  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'BOSS RUSH'), h('h1', { class: 'page-title' }, 'Game jams')),
      h('div', { class: 'head-actions' }, btn('New jam', () => editJam(null, draw), 'btn-primary'))),
    list);

  function draw() {
    const jams = [...data.jams].sort((a, b) => (isLive(b) - isLive(a)) || (new Date(b.deadline || 0) - new Date(a.deadline || 0)));
    clear(list, jams.length ? jams.map((j) => jamCard(j, ctx, draw)) : empty('No jams yet. Add one to get a countdown and checklist.'));
  }
  draw();
  pull().then((changed) => changed && draw()).catch(() => {});
}

function jamCard(j, ctx, redraw) {
  const update = (fn) => { fn(); commit(); redraw(); };
  const logInput = h('input', { type: 'text', class: 'search jam-log-input', placeholder: 'Post an update: what did you finish?', 'aria-label': 'Jam update', autocomplete: 'off' });
  const logForm = h('form', { class: 'search-form' }, logInput, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Post'));
  logForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = logInput.value.trim();
    if (text) update(() => j.log.unshift({ id: uid(), at: Date.now(), text }));
  });
  const itemInput = h('input', { type: 'text', class: 'search', placeholder: 'Add a checklist item', 'aria-label': 'New checklist item', autocomplete: 'off' });
  const itemForm = h('form', { class: 'search-form' }, itemInput, h('button', { class: 'btn', type: 'submit' }, 'Add'));
  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = itemInput.value.trim();
    if (text) update(() => j.checklist.push({ id: uid(), text, done: false }));
  });

  return h('article', { class: 'jam' },
    h('header', { class: 'jam-head' },
      h('div', {},
        h('p', { class: 'pixel-label' }, j.name.toUpperCase()),
        h('h2', { class: 'jam-title' }, j.game || j.name),
        j.theme ? h('p', { class: 'row-meta' }, 'Theme: ', h('strong', { class: 'jam-theme' }, j.theme)) : null),
      h('div', { class: 'head-actions' },
        h('select', { class: 'capture-kind', 'aria-label': 'Status', onchange: (e) => update(() => { j.status = e.target.value; }) },
          STATUSES.map((s) => h('option', { value: s, selected: s === j.status }, s))),
        btn('Edit', () => editJam(j, redraw), 'btn-small'),
        j.deadline && getToken() ? btn('Add to calendar', () => addToCalendar(j, ctx), 'btn-small') : null)),
    h('div', { class: 'jam-clocks' },
      j.uploadBy ? clock('UPLOAD BY', j.uploadBy) : null,
      clock('DEADLINE', j.deadline)),
    j.notes ? h('p', { class: 'jam-notes' }, j.notes) : null,
    j.links.length ? h('p', { class: 'profile-links' }, j.links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label))) : null,
    h('div', { class: 'grid grid-2' },
      panel('Submission checklist', { action: progress(j) },
        h('ul', { class: 'list' }, j.checklist.map((c) => {
          const box = h('input', { type: 'checkbox', checked: c.done, 'aria-label': c.text, onchange: (e) => update(() => { c.done = e.target.checked; }) });
          return h('li', { class: `row task-row ${c.done ? 'is-done' : ''}` },
            h('label', { class: 'check' }, box, h('span', { class: 'row-title wrap' }, c.text)),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove: ${c.text}`, title: 'Remove', onclick: () => update(() => { j.checklist = j.checklist.filter((x) => x !== c); }) }, 'X'));
        })),
        itemForm),
      panel('Updates', { meta: j.log.length ? `${j.log.length}` : '' },
        logForm,
        j.log.length ? h('ul', { class: 'list' }, j.log.map((l) => h('li', { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-title wrap' }, l.text)),
          h('span', { class: 'row-meta' }, ago(new Date(l.at))),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete update', title: 'Delete', onclick: () => update(() => { j.log = j.log.filter((x) => x !== l); }) }, 'X')))) : empty('No updates yet. Log progress as you go: it doubles as your devlog.'))));
}

function editJam(j, redraw) {
  const isNew = !j;
  const v = j || { name: '', game: '', theme: '', uploadBy: '', deadline: '', notes: '', links: [] };
  const local = (iso) => (iso ? toLocalInput(new Date(iso)) : '');
  formModal(isNew ? 'New jam' : 'Edit jam', [
    { name: 'name', label: 'Jam', value: v.name, required: true, placeholder: 'e.g. GMTK Game Jam 2027' },
    { name: 'game', label: 'Your game', value: v.game },
    { name: 'theme', label: 'Theme', value: v.theme },
    { name: 'uploadBy', label: 'Your upload target (optional)', type: 'datetime-local', value: local(v.uploadBy) },
    { name: 'deadline', label: 'Submission deadline', type: 'datetime-local', value: local(v.deadline) },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, value: v.notes },
    { name: 'links', label: 'Links (one per line: Label | https://…)', type: 'textarea', rows: 3, value: v.links.map((l) => `${l.label} | ${l.url}`).join('\n'), placeholder: 'Jam page | https://itch.io/jam/…\nGame page | https://….itch.io/…' }
  ], async (d) => {
    const links = d.links.split('\n').map((line) => {
      const [label, url] = line.includes('|') ? line.split('|').map((s) => s.trim()) : [line.trim(), line.trim()];
      return /^https:\/\//.test(url) ? { label: label || url, url } : null;
    }).filter(Boolean);
    const iso = (x) => (x ? new Date(x).toISOString() : '');
    const fields = { name: d.name, game: d.game, theme: d.theme, uploadBy: iso(d.uploadBy), deadline: iso(d.deadline), notes: d.notes, links };
    if (isNew) data.jams.unshift({ id: uid(), status: 'Planning', checklist: [], log: [], ...fields });
    else Object.assign(j, fields);
    commit();
    redraw();
  }, { submitLabel: isNew ? 'Create' : 'Save' });
  if (!isNew) {
    document.querySelector('#modal .form-actions').prepend(btn('Delete jam', () => {
      if (!confirm(`Delete ${j.name}? Its checklist and updates go too.`)) return;
      data.jams = data.jams.filter((x) => x !== j);
      commit();
      document.querySelector('#modal').close();
      redraw();
    }, 'btn-danger push-left'));
  }
}

async function addToCalendar(j, ctx) {
  try {
    const end = new Date(j.deadline);
    const start = new Date(end.getTime() - 30 * 60000);
    await G.createEvent({ title: `${j.name} deadline: submit ${j.game || 'your game'}`, start: start.toISOString(), end: end.toISOString(), allDay: false, description: 'Added from Hub' });
    if (j.uploadBy) {
      const u = new Date(j.uploadBy);
      await G.createEvent({ title: `${j.name}: upload ${j.game || 'your game'}`, start: new Date(u.getTime() - 30 * 60000).toISOString(), end: u.toISOString(), allDay: false, description: 'Your own upload target. Added from Hub' });
    }
    toast('Added to your Google Calendar');
  } catch (err) { ctx.handleError(err); }
}
