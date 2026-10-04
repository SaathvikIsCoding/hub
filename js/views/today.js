// Today: one screen with what matters now — next events, due tasks, unread mail,
// GitHub pings, a quick-capture box and a focus timer.
import { h, clear, panel, empty, loading, errorBox, dayLabel, timeLabel, ago, toast, startOfDay } from '../ui.js';
import * as G from '../google.js';
import * as GH from '../github.js';
import { cached, cache } from '../store.js';
import { getToken } from '../auth.js';
import { focusTimer } from './focus.js';
import { openThread } from './mail.js';
import { eventRow } from './calendar.js';

export function render(root, ctx) {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = ctx.account?.name?.split(' ')[0] || 'Saathvik';

  const slots = {
    events: h('div'), tasks: h('div'), mail: h('div'), github: h('div')
  };

  clear(root,
    h('div', { class: 'page-head' },
      h('p', { class: 'pixel-label' }, now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()),
      h('h1', { class: 'page-title' }, `${greet}, ${name}`)),
    capture(ctx),
    h('div', { class: 'grid' },
      panel('Up next', { action: h('a', { class: 'panel-link', href: '#/calendar' }, 'Calendar') }, slots.events),
      panel('Tasks due', { action: h('a', { class: 'panel-link', href: '#/tasks' }, 'All tasks') }, slots.tasks),
      panel('Inbox', { action: h('a', { class: 'panel-link', href: '#/mail' }, 'Mail') }, slots.mail),
      panel('GitHub', { action: h('a', { class: 'panel-link', href: '#/updates' }, 'Updates') }, slots.github),
      panel('Focus', {}, focusTimer())));

  loadEvents(slots.events, ctx);
  loadTasks(slots.tasks, ctx);
  loadMail(slots.mail, ctx);
  loadGithub(slots.github);
}

// ---------- Quick capture: "t buy milk", "e lunch tomorrow 1pm", "n idea" ----------

function capture(ctx) {
  const input = h('input', { class: 'capture-input', type: 'text', placeholder: 'Quick add: task, event or note…', 'aria-label': 'Quick add', autocomplete: 'off' });
  const kind = h('select', { class: 'capture-kind', 'aria-label': 'Add as' },
    h('option', { value: 'task' }, 'Task'), h('option', { value: 'event' }, 'Event'), h('option', { value: 'note' }, 'Note'));
  const form = h('form', { class: 'capture' }, kind, input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    try {
      if (kind.value === 'task') {
        const lists = await G.taskLists();
        await G.addTask(lists[0].id, { title: text });
        toast(`Task added to ${lists[0].title}`);
      } else if (kind.value === 'event') {
        const ev = await G.quickAddEvent(text);
        const start = new Date(ev.start.dateTime || `${ev.start.date}T00:00`);
        toast(`Event added: ${dayLabel(start)}${ev.start.dateTime ? `, ${timeLabel(start)}` : ''}`);
      } else {
        const { addNote } = await import('./notes.js');
        await addNote(text);
        toast('Note saved');
      }
      input.value = '';
      ctx.refresh();
    } catch (err) {
      ctx.handleError(err);
    }
  });
  return h('div', {}, form, h('p', { class: 'hint' }, 'Events understand plain English, e.g. "Studio review Friday 3pm".'));
}

// ---------- Loaders ----------

async function loadEvents(slot, ctx) {
  const show = (events) => {
    const soon = events.filter((e) => e.end > new Date()).slice(0, 6);
    clear(slot, soon.length ? h('ul', { class: 'list' }, soon.map((e) => eventRow(e, { showDay: true }))) : empty('Nothing on your calendar for the next 2 days.'));
  };
  const prev = cached('today-events');
  if (prev) show(prev);
  else clear(slot, loading());
  if (!getToken()) return prev ? null : clear(slot, ctx.signInPrompt());
  try {
    const events = await G.listEvents({ from: startOfDay(), days: 2 });
    cache('today-events', events);
    show(events);
  } catch (err) {
    if (!ctx.handleError(err, true)) clear(slot, errorBox(err, () => loadEvents(slot, ctx)));
  }
}

async function loadTasks(slot, ctx) {
  const show = (tasks) => {
    const end = new Date(startOfDay().getTime() + 86400000);
    const due = tasks.filter((t) => !t.done && t.due && t.due < end).sort((a, b) => a.due - b.due);
    const undated = tasks.filter((t) => !t.done && !t.due).slice(0, Math.max(0, 5 - due.length));
    const rows = [...due, ...undated].slice(0, 7);
    clear(slot, rows.length ? h('ul', { class: 'list' }, rows.map((t) => taskLine(t, ctx, slot))) : empty('All clear. Nothing due today.'));
  };
  const prev = cached('today-tasks');
  if (prev) show(prev);
  else clear(slot, loading());
  if (!getToken()) return prev ? null : clear(slot, ctx.signInPrompt());
  try {
    const tasks = await G.allOpenTasks();
    cache('today-tasks', tasks);
    show(tasks);
  } catch (err) {
    if (!ctx.handleError(err, true)) clear(slot, errorBox(err, () => loadTasks(slot, ctx)));
  }
}

function taskLine(t, ctx, slot) {
  const overdue = t.due && t.due < startOfDay();
  const box = h('input', { type: 'checkbox', 'aria-label': `Done: ${t.title}` });
  box.addEventListener('change', async () => {
    row.classList.add('is-done');
    try {
      await G.updateTask(t.listId, t.id, { done: true });
      toast('Task done', { undo: async () => { await G.updateTask(t.listId, t.id, { done: false }); loadTasks(slot, ctx); } });
      setTimeout(() => row.remove(), 400);
    } catch (err) { row.classList.remove('is-done'); box.checked = false; ctx.handleError(err); }
  });
  const row = h('li', { class: 'row task-row' },
    h('label', { class: 'check' }, box, h('span', { class: 'row-title' }, t.title)),
    t.due ? h('span', { class: `tag ${overdue ? 'tag-danger' : 'tag-gold'}` }, overdue ? 'OVERDUE' : 'TODAY') : h('span', { class: 'row-meta' }, t.list));
  return row;
}

async function loadMail(slot, ctx) {
  const show = ({ counts, threads }) => clear(slot,
    h('p', { class: 'big-stat' }, h('span', { class: 'big-num' }, counts.unread), ' unread in inbox'),
    threads.length ? h('ul', { class: 'list' }, threads.map((t) =>
      h('li', { class: 'row row-click', tabindex: 0, role: 'button', onclick: () => openThread(t.id, ctx), onkeydown: (e) => e.key === 'Enter' && openThread(t.id, ctx) },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, t.from.name),
          h('span', { class: 'row-sub' }, t.subject)),
        h('span', { class: 'row-meta' }, ago(t.date))))) : empty('Inbox zero. Nice.'));
  const prev = cached('today-mail');
  if (prev) show(prev);
  else clear(slot, loading());
  if (!getToken()) return prev ? null : clear(slot, ctx.signInPrompt());
  try {
    const [counts, list] = await Promise.all([G.inboxCounts(), G.listThreads({ q: 'in:inbox is:unread', max: 5 })]);
    const data = { counts, threads: list.threads };
    cache('today-mail', data);
    show(data);
    ctx.setBadge('mail', counts.unread);
  } catch (err) {
    if (!ctx.handleError(err, true)) clear(slot, errorBox(err, () => loadMail(slot, ctx)));
  }
}

async function loadGithub(slot) {
  clear(slot, loading());
  try {
    const items = [];
    if (GH.ghToken()) {
      const notes = await GH.notifications();
      items.push(h('p', { class: 'big-stat' }, h('span', { class: 'big-num' }, notes.length), ' unread notifications'));
    }
    const evs = (await GH.events()).slice(0, 4).map((e) => ({ ...GH.describeEvent(e), at: new Date(e.created_at) }));
    items.push(evs.length ? h('ul', { class: 'list' }, evs.map((e) =>
      h('li', { class: 'row' },
        h('div', { class: 'row-main' }, h('a', { class: 'row-title', href: e.url, target: '_blank', rel: 'noopener' }, e.text), e.detail ? h('span', { class: 'row-sub' }, e.detail) : null),
        h('span', { class: 'row-meta' }, ago(e.at))))) : empty('No recent GitHub activity.'));
    clear(slot, items);
  } catch (err) {
    clear(slot, errorBox(err, () => loadGithub(slot)));
  }
}
