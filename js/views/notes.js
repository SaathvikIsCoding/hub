// Notes: quick notes and ideas, synced through a hidden app folder in your
// Google Drive so the same notes show on Windows, iPhone and the web.
import { h, clear, empty, loading, errorBox, ago, toast, btn } from '../ui.js';
import * as G from '../google.js';
import { load, save } from '../store.js';
import { getToken } from '../auth.js';

// Local copy first (instant, offline), then Drive is the source of truth.
const local = () => load('notes', []);

let saveTimer;
async function persist(notes) {
  save('notes', notes);
  clearTimeout(saveTimer);
  return new Promise((resolve, reject) => {
    saveTimer = setTimeout(() => G.writeNotes(notes).then(resolve, reject), 600);
  });
}

export async function addNote(text) {
  const notes = getToken() ? await G.readNotes().catch(() => local()) : local();
  notes.unshift({ id: crypto.randomUUID(), text, pinned: false, at: Date.now() });
  save('notes', notes);
  await G.writeNotes(notes);
  save('notesSynced', notes.map((n) => n.id));
}

export function render(root, ctx) {
  let notes = local();
  let filter = '';
  const grid = h('div', { class: 'notes-grid' });
  const status = h('span', { class: 'panel-meta' });
  const input = h('textarea', { class: 'note-input', rows: 3, placeholder: 'Write a note, idea or link… (Ctrl+Enter to save)', 'aria-label': 'New note' });
  const add = async () => {
    const text = input.value.trim();
    if (!text) return;
    notes.unshift({ id: crypto.randomUUID(), text, pinned: false, at: Date.now() });
    input.value = '';
    draw();
    sync();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search notes', 'aria-label': 'Search notes', oninput: (e) => { filter = e.target.value.toLowerCase(); draw(); } });

  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'INVENTORY'), h('h1', { class: 'page-title' }, 'Notes')),
      status),
    h('div', { class: 'note-new' }, input, btn('Save note', add, 'btn-primary')),
    search,
    grid);

  async function sync() {
    if (!getToken()) { status.textContent = 'Saved on this device. Connect Google to sync.'; save('notes', notes); return; }
    status.textContent = 'Syncing…';
    try { await persist(notes); save('notesSynced', notes.map((n) => n.id)); status.textContent = 'Synced'; } catch (err) { status.textContent = 'Saved on this device'; ctx.handleError(err); }
  }

  function draw() {
    const shown = notes.filter((n) => !filter || n.text.toLowerCase().includes(filter))
      .sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
    clear(grid, shown.length ? shown.map((n) => noteCard(n)) : empty(filter ? 'No notes match.' : 'No notes yet.'));
  }

  function noteCard(n) {
    const text = h('p', { class: 'note-text' }, n.text);
    return h('article', { class: `note ${n.pinned ? 'is-pinned' : ''}` },
      text,
      h('footer', { class: 'note-foot' },
        h('span', { class: 'row-meta' }, ago(new Date(n.at))),
        h('div', { class: 'note-actions' },
          btn(n.pinned ? 'Unpin' : 'Pin', () => { n.pinned = !n.pinned; draw(); sync(); }, 'btn-small'),
          btn('Copy', () => navigator.clipboard.writeText(n.text).then(() => toast('Copied')), 'btn-small'),
          btn('Edit', () => {
            const area = h('textarea', { class: 'note-input', rows: 5 }, n.text);
            text.replaceWith(area);
            area.focus();
            area.addEventListener('blur', () => { n.text = area.value.trim() || n.text; n.at = Date.now(); draw(); sync(); });
          }, 'btn-small'),
          btn('Delete', () => {
            const i = notes.indexOf(n);
            notes.splice(i, 1);
            draw(); sync();
            toast('Note deleted', { undo: () => { notes.splice(i, 0, n); draw(); sync(); } });
          }, 'btn-small btn-danger'))));
  }

  draw();
  if (getToken()) {
    if (!notes.length) clear(grid, loading());
    status.textContent = 'Syncing…';
    G.readNotes().then((remote) => {
      // Notes made offline on this device that Drive hasn't seen yet are kept.
      const ids = new Set(remote.map((n) => n.id));
      const localOnly = local().filter((n) => !ids.has(n.id) && !load('notesSynced', []).includes(n.id));
      notes = [...localOnly, ...remote];
      save('notes', notes);
      save('notesSynced', remote.map((n) => n.id));
      draw();
      if (localOnly.length) sync(); else status.textContent = 'Synced';
    }).catch((err) => {
      status.textContent = 'Showing notes saved on this device';
      if (!ctx.handleError(err, true) && !notes.length) clear(grid, errorBox(err));
    });
  } else {
    status.textContent = 'Saved on this device. Connect Google to sync.';
  }
}
