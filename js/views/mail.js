// Mail: Gmail inbox with filters, search, read, reply, compose, archive, star.
import { h, clear, empty, loading, errorBox, ago, toast, modal, closeModal, btn } from '../ui.js';
import * as G from '../google.js';
import { cached, cache, load, save } from '../store.js';
import { getToken, account } from '../auth.js';

const FILTERS = [
  ['in:inbox', 'Inbox'],
  ['in:inbox is:unread', 'Unread'],
  ['is:starred', 'Starred'],
  ['is:important in:inbox', 'Important'],
  ['in:sent', 'Sent']
];

let state = { q: 'in:inbox', search: '' };

export function render(root, ctx) {
  const list = h('div', { class: 'mail-list' });
  const more = h('div', { class: 'more-row' });
  const searchInput = h('input', { type: 'search', class: 'search', placeholder: 'Search mail (Gmail search works: from:, has:attachment…)', value: state.search, 'aria-label': 'Search mail' });
  const searchForm = h('form', { class: 'search-form', role: 'search' }, searchInput);
  searchForm.addEventListener('submit', (e) => { e.preventDefault(); state.search = searchInput.value.trim(); load_(); });

  const tabs = h('div', { class: 'tabs', role: 'tablist' }, FILTERS.map(([q, label]) =>
    h('button', { class: `tab ${state.q === q ? 'is-active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(state.q === q), onclick: () => { state.q = q; state.search = ''; searchInput.value = ''; render(root, ctx); } }, label)));

  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'COMMS'), h('h1', { class: 'page-title' }, 'Mail')),
      h('div', { class: 'head-actions' },
        btn('Compose', () => compose({}, ctx), 'btn-primary'),
        h('a', { class: 'btn', href: 'https://mail.google.com/', target: '_blank', rel: 'noopener' }, 'Open Gmail'))),
    tabs, searchForm, list, more);

  const query = () => (state.search ? `${state.search}${state.q === 'in:inbox' ? '' : ` ${state.q}`}` : state.q);
  const key = () => `mail:${query()}`;

  async function load_(pageToken) {
    if (!getToken()) { clear(list, ctx.signInPrompt()); return; }
    if (!pageToken) {
      const prev = cached(key());
      clear(list, prev ? prev.map((t) => threadRow(t, ctx, list)) : loading());
    }
    try {
      const r = await G.listThreads({ q: query(), pageToken, max: 25 });
      if (!pageToken) {
        cache(key(), r.threads);
        clear(list, r.threads.length ? r.threads.map((t) => threadRow(t, ctx, list)) : empty(state.search ? 'No mail matches that search.' : 'Nothing here.'));
      } else {
        list.append(...r.threads.map((t) => threadRow(t, ctx, list)));
      }
      clear(more, r.nextPageToken ? btn('Load more', () => { clear(more, loading()); load_(r.nextPageToken); }) : null);
      if (state.q === 'in:inbox' && !state.search) ctx.setBadge('mail', r.threads.filter((t) => t.unread).length ? (await G.inboxCounts()).unread : 0);
    } catch (err) {
      if (!ctx.handleError(err, true)) clear(list, errorBox(err, () => load_()));
    }
  }
  load_();
}

function threadRow(t, ctx, list) {
  const star = h('button', { class: `icon-btn star ${t.starred ? 'is-on' : ''}`, type: 'button', 'aria-label': t.starred ? 'Unstar' : 'Star', 'aria-pressed': String(t.starred) }, '*');
  star.addEventListener('click', async (e) => {
    e.stopPropagation();
    t.starred = !t.starred;
    star.classList.toggle('is-on', t.starred);
    star.setAttribute('aria-pressed', String(t.starred));
    try { await G.modifyThread(t.id, t.starred ? ['STARRED'] : [], t.starred ? [] : ['STARRED']); } catch (err) { ctx.handleError(err); }
  });
  const archive = t.inbox ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Archive', title: 'Archive' }, 'A') : null;
  archive?.addEventListener('click', async (e) => {
    e.stopPropagation();
    row.hidden = true;
    try {
      await G.modifyThread(t.id, [], ['INBOX']);
      toast('Archived', { undo: async () => { await G.modifyThread(t.id, ['INBOX'], []); row.hidden = false; } });
    } catch (err) { row.hidden = false; ctx.handleError(err); }
  });
  const row = h('div', { class: `mail-row ${t.unread ? 'is-unread' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${t.from.name}: ${t.subject}` },
    star,
    h('div', { class: 'mail-main' },
      h('div', { class: 'mail-top' },
        h('span', { class: 'mail-from' }, t.from.name, t.count > 1 ? h('span', { class: 'mail-count' }, ` ${t.count}`) : null),
        h('span', { class: 'mail-date' }, ago(t.date))),
      h('span', { class: 'mail-subject' }, t.subject),
      h('span', { class: 'mail-snippet' }, t.snippet)),
    archive);
  const open = () => { row.classList.remove('is-unread'); openThread(t.id, ctx, { onChange: () => list && ctx.refresh() }); };
  row.addEventListener('click', open);
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return row;
}

// ---------- Thread reader ----------

export async function openThread(id, ctx, { onChange } = {}) {
  const body = h('div', { class: 'thread' }, loading());
  modal('Mail', body, { wide: true });
  try {
    const t = await G.getThread(id);
    if (t.messages.some((m) => m.unread)) G.modifyThread(id, [], ['UNREAD']).catch(() => {});
    const last = t.messages[t.messages.length - 1];
    const act = async (fn, msg) => {
      try { await fn(); toast(msg); closeModal(); onChange?.(); } catch (err) { ctx.handleError(err); }
    };
    clear(body,
      h('h3', { class: 'thread-subject' }, t.subject),
      h('div', { class: 'thread-actions' },
        btn('Reply', () => reply(t, last, ctx, false), 'btn-primary'),
        last.cc || (last.to || '').includes(',') ? btn('Reply all', () => reply(t, last, ctx, true)) : null,
        btn('Archive', () => act(() => G.modifyThread(id, [], ['INBOX']), 'Archived')),
        btn('Mark unread', () => act(() => G.modifyThread(id, ['UNREAD'], []), 'Marked unread')),
        btn('Trash', () => act(() => G.trashThread(id), 'Moved to Trash')),
        btn('To task', () => act(async () => {
          const lists = await G.taskLists();
          await G.addTask(lists[0].id, { title: `Reply: ${t.subject}`, notes: `From ${last.from.name} <${last.from.email}>\nhttps://mail.google.com/mail/u/0/#all/${id}` });
        }, 'Added to your tasks')),
        h('a', { class: 'btn', href: `https://mail.google.com/mail/u/0/#all/${id}`, target: '_blank', rel: 'noopener' }, 'Open in Gmail')),
      t.messages.map((m, i) => messageBlock(m, i === t.messages.length - 1)));
  } catch (err) {
    if (!ctx.handleError(err, true)) clear(body, errorBox(err));
  }
}

function messageBlock(m, open) {
  const content = h('div', { class: 'msg-content' });
  const details = h('details', { class: 'msg', open },
    h('summary', { class: 'msg-head' },
      h('span', { class: 'msg-from' }, m.from.name, h('span', { class: 'msg-email' }, ` <${m.from.email}>`)),
      h('span', { class: 'msg-date' }, m.date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))),
    content);
  const draw = (images) => {
    if (m.html) {
      clear(content, mailFrame(m.html, images),
        !images && /<img/i.test(m.html) ? btn('Show images', () => draw(true), 'btn-small') : null);
    } else {
      clear(content, h('pre', { class: 'msg-text' }, m.text || '(empty message)'));
    }
    if (m.attachments.length) content.append(h('p', { class: 'msg-attach' }, `Attachments: ${m.attachments.map((a) => a.name).join(', ')} (open in Gmail)`));
  };
  draw(false);
  return details;
}

// HTML mail in a locked iframe: no scripts, no forms, links open in a new tab,
// remote images (tracking pixels) blocked until you choose "Show images".
function mailFrame(html, images) {
  const csp = `default-src 'none'; style-src 'unsafe-inline' *; font-src *; img-src data: cid:${images ? ' https: http:' : ''}`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:12px;font:15px/1.5 system-ui,sans-serif;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  const frame = h('iframe', { class: 'mail-frame', sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', title: 'Message', referrerpolicy: 'no-referrer' });
  frame.srcdoc = doc;
  frame.addEventListener('load', () => {
    try { frame.style.height = `${frame.contentDocument.documentElement.scrollHeight + 8}px`; } catch { /* keep default */ }
  });
  return frame;
}

// ---------- Compose / reply ----------

function reply(t, m, ctx, all) {
  const me = account()?.email?.toLowerCase();
  const to = m.replyTo || `${m.from.name} <${m.from.email}>`;
  const others = all ? [m.to, m.cc].filter(Boolean).join(', ').split(',').map((s) => s.trim()).filter((s) => s && !s.toLowerCase().includes(me) && !s.includes(m.from.email)) : [];
  compose({
    to, cc: others.join(', '),
    subject: /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`,
    body: `\n\nOn ${m.date.toLocaleString()}, ${m.from.name} wrote:\n${(m.text || '').split('\n').map((l) => `> ${l}`).join('\n')}`,
    threadId: t.id, inReplyTo: m.messageId, references: m.references
  }, ctx);
}

export function compose(init, ctx) {
  const draft = init.threadId ? init : { ...load('draft', {}), ...Object.fromEntries(Object.entries(init).filter(([, v]) => v)) };
  const f = (name, label, attrs = {}) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label),
    h('input', { name, value: draft[name] || '', autocomplete: 'off', ...attrs }));
  const bodyEl = h('textarea', { name: 'body', rows: 12 }, draft.body || '');
  const form = h('form', { class: 'form' },
    f('to', 'To', { type: 'text', required: true, placeholder: 'name@example.com' }),
    f('cc', 'Cc'),
    f('subject', 'Subject'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Message'), bodyEl),
    h('div', { class: 'form-actions' },
      btn('Discard', () => { save('draft', null); closeModal(); }),
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send')));
  const read = () => Object.fromEntries(['to', 'cc', 'subject', 'body'].map((n) => [n, form.elements[n].value]));
  if (!init.threadId) form.addEventListener('input', () => save('draft', read())); // new mail survives a reload
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      await G.sendMail({ ...read(), threadId: init.threadId, inReplyTo: init.inReplyTo, references: init.references });
      save('draft', null);
      closeModal();
      toast('Sent');
    } catch (err) {
      submit.disabled = false;
      ctx.handleError(err);
    }
  });
  modal(init.threadId ? 'Reply' : 'New message', form, { wide: true });
  (init.threadId ? bodyEl : form.elements.to).focus();
  if (init.threadId) bodyEl.setSelectionRange(0, 0);
}
