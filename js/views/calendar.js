// Calendar: agenda for the next 30 days across your selected Google calendars.
import { h, clear, empty, loading, errorBox, dayLabel, timeLabel, toast, modal, closeModal, formModal, btn, startOfDay, toLocalInput } from '../ui.js';
import * as G from '../google.js';
import { cached, cache } from '../store.js';
import { getToken } from '../auth.js';

let days = 30;

export function render(root, ctx) {
  const list = h('div', { class: 'agenda' });
  const quick = h('input', { type: 'text', class: 'search', placeholder: 'Quick add: "Jury prep Thursday 10am to 12pm"', 'aria-label': 'Quick add event', autocomplete: 'off' });
  const quickForm = h('form', { class: 'search-form' }, quick, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'));
  quickForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!quick.value.trim()) return;
    try {
      const ev = await G.quickAddEvent(quick.value.trim());
      const start = new Date(ev.start.dateTime || `${ev.start.date}T00:00`);
      toast(`Added: ${ev.summary || 'event'}, ${dayLabel(start)}${ev.start.dateTime ? ` ${timeLabel(start)}` : ''}`);
      quick.value = '';
      load_();
    } catch (err) { ctx.handleError(err); }
  });

  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'SCHEDULE'), h('h1', { class: 'page-title' }, 'Calendar')),
      h('div', { class: 'head-actions' },
        btn('New event', () => newEvent(ctx, load_), 'btn-primary'),
        h('a', { class: 'btn', href: 'https://calendar.google.com/', target: '_blank', rel: 'noopener' }, 'Open Google Calendar'))),
    quickForm,
    list);

  function draw(events) {
    if (!events.length) { clear(list, empty(`Nothing scheduled in the next ${days} days.`)); return; }
    const groups = new Map();
    for (const e of events) {
      // Multi-day events show on each day they cover (from today on).
      const first = startOfDay(e.start < new Date() ? new Date() : e.start);
      for (let d = first; d < e.end || +d === +startOfDay(e.start); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const k = d.toDateString();
        if (!groups.has(k)) groups.set(k, { day: d, items: [] });
        groups.get(k).items.push(e);
        if (!e.allDay) break;
      }
    }
    clear(list, [...groups.values()].sort((a, b) => a.day - b.day).map((g) =>
      h('section', { class: 'agenda-day' },
        h('h2', { class: 'agenda-date' }, h('span', { class: 'pixel-label' }, dayLabel(g.day).toUpperCase()), ' ',
          h('span', { class: 'agenda-sub' }, g.day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))),
        h('ul', { class: 'list' }, g.items.map((e) => eventRow(e, { ctx, onChange: load_ }))))),
      days < 90 ? h('div', { class: 'more-row' }, btn('Show more', () => { days += 30; load_(); })) : null);
  }

  async function load_() {
    if (!getToken()) { clear(list, ctx.signInPrompt()); return; }
    const prev = cached(`events:${days}`);
    if (prev) draw(prev); else clear(list, loading());
    try {
      const events = await G.listEvents({ from: startOfDay(), days });
      cache(`events:${days}`, events);
      draw(events);
    } catch (err) {
      if (!ctx.handleError(err, true)) clear(list, errorBox(err, load_));
    }
  }
  load_();
}

export function eventRow(e, { showDay, ctx, onChange } = {}) {
  const now = new Date();
  const live = !e.allDay && e.start <= now && e.end > now;
  const when = e.allDay ? 'All day' : `${timeLabel(e.start)} – ${timeLabel(e.end)}`;
  const row = h('li', { class: `row row-click event-row ${live ? 'is-live' : ''}`, tabindex: 0, role: 'button' },
    h('span', { class: 'dot', style: `background:${e.color || 'var(--accent)'}`, 'aria-hidden': 'true' }),
    h('div', { class: 'row-main' },
      h('span', { class: 'row-title' }, e.title),
      h('span', { class: 'row-sub' }, showDay ? `${dayLabel(e.start)}, ${when}` : when, e.location ? `, ${e.location}` : '')),
    live ? h('span', { class: 'tag tag-accent' }, 'NOW') : null,
    e.meet ? h('a', { class: 'btn btn-small', href: e.meet, target: '_blank', rel: 'noopener', onclick: (ev) => ev.stopPropagation() }, 'Join') : null);
  const open = () => eventDetails(e, ctx, onChange);
  row.addEventListener('click', open);
  row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
  return row;
}

function eventDetails(e, ctx, onChange) {
  const when = e.allDay
    ? `${e.start.toLocaleDateString(undefined, { dateStyle: 'full' })} (all day)`
    : `${e.start.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} – ${timeLabel(e.end)}`;
  modal(e.title, h('div', { class: 'event-detail' },
    h('p', {}, when),
    h('p', { class: 'muted' }, e.calendar),
    e.location ? h('p', {}, 'Where: ', e.location) : null,
    e.description ? h('pre', { class: 'msg-text' }, e.description.replace(/<[^>]+>/g, ' ')) : null,
    h('div', { class: 'form-actions' },
      e.meet ? h('a', { class: 'btn btn-primary', href: e.meet, target: '_blank', rel: 'noopener' }, 'Join call') : null,
      e.location ? h('a', { class: 'btn', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`, target: '_blank', rel: 'noopener' }, 'Map') : null,
      h('a', { class: 'btn', href: e.link, target: '_blank', rel: 'noopener' }, 'Edit in Google'),
      e.canEdit && ctx ? btn('Delete', async () => {
        if (!confirm(`Delete "${e.title}"?`)) return;
        try { await G.deleteEvent(e.calendarId, e.id); closeModal(); toast('Event deleted'); onChange?.(); } catch (err) { ctx.handleError(err); }
      }, 'btn-danger') : null)));
}

function newEvent(ctx, onDone) {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3600000);
  formModal('New event', [
    { name: 'title', label: 'Title', required: true },
    { name: 'start', label: 'Starts', type: 'datetime-local', value: toLocalInput(start), required: true },
    { name: 'end', label: 'Ends', type: 'datetime-local', value: toLocalInput(end) },
    { name: 'allDay', label: 'All day', type: 'checkbox' },
    { name: 'location', label: 'Location' },
    { name: 'description', label: 'Notes', type: 'textarea', rows: 3 }
  ], async (d) => {
    await G.createEvent(d);
    toast('Event created');
    onDone();
  }, { submitLabel: 'Create' });
}
