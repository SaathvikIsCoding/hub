// Thin clients for Gmail, Calendar, Tasks and Drive (app folder) REST APIs.
import { getToken, AuthError } from './auth.js';
import { load, save } from './store.js';

const API = 'https://www.googleapis.com';

async function gfetch(url, { method = 'GET', body, headers = {}, raw } = {}) {
  const token = getToken();
  if (!token) throw new AuthError();
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body && !raw ? JSON.stringify(body) : body
  });
  if (res.status === 401) {
    save('gtoken', null);
    throw new AuthError();
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { msg = (await res.json()).error?.message || msg; } catch { /* not JSON */ }
    if (res.status === 403 && /insufficient|scope/i.test(msg)) msg = 'Permission missing: reconnect Google and tick every box on the consent screen.';
    else if (res.status === 403 && /has not been used|disabled/i.test(msg)) msg = `This Google API isn't turned on in your Cloud project yet. ${msg}`;
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res.text();
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

export async function userInfo() {
  const u = await gfetch('/oauth2/v3/userinfo');
  const acct = { email: u.email, name: u.name, picture: u.picture };
  save('gaccount', acct);
  return acct;
}

// ================= Gmail =================

const GM = '/gmail/v1/users/me';

export async function inboxCounts() {
  const l = await gfetch(`${GM}/labels/INBOX`);
  return { unread: l.threadsUnread, total: l.threadsTotal };
}

const header = (msg, name) => msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || '';

export function parseFrom(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  return m ? { name: m[1].trim() || m[2], email: m[2] } : { name: from, email: from };
}

export async function listThreads({ q = 'in:inbox', pageToken, max = 20 } = {}) {
  const list = await gfetch(`${GM}/threads?${qs({ q, pageToken, maxResults: max })}`);
  const threads = await Promise.all((list.threads || []).map((t) =>
    gfetch(`${GM}/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
  return {
    nextPageToken: list.nextPageToken,
    threads: threads.map((t) => {
      const last = t.messages[t.messages.length - 1];
      const labels = new Set(t.messages.flatMap((m) => m.labelIds || []));
      return {
        id: t.id,
        subject: header(t.messages[0], 'Subject') || '(no subject)',
        from: parseFrom(header(last, 'From')),
        date: new Date(Number(last.internalDate)),
        snippet: decodeEntities(last.snippet || ''),
        count: t.messages.length,
        unread: labels.has('UNREAD'),
        starred: labels.has('STARRED'),
        important: labels.has('IMPORTANT'),
        inbox: labels.has('INBOX')
      };
    })
  };
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s; // textarea never runs markup; this only resolves &amp; etc.
  return t.value;
}

function b64urlDecode(data) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function findParts(part, out = { html: '', text: '', attachments: [] }) {
  if (!part) return out;
  const mime = part.mimeType || '';
  if (part.filename && part.body?.attachmentId) out.attachments.push({ name: part.filename, size: part.body.size });
  else if (mime === 'text/html' && part.body?.data && !out.html) out.html = b64urlDecode(part.body.data);
  else if (mime === 'text/plain' && part.body?.data && !out.text) out.text = b64urlDecode(part.body.data);
  (part.parts || []).forEach((p) => findParts(p, out));
  return out;
}

export async function getThread(id) {
  const t = await gfetch(`${GM}/threads/${id}?format=full`);
  return {
    id: t.id,
    subject: header(t.messages[0], 'Subject') || '(no subject)',
    messages: t.messages.map((m) => ({
      id: m.id,
      from: parseFrom(header(m, 'From')),
      to: header(m, 'To'),
      cc: header(m, 'Cc'),
      replyTo: header(m, 'Reply-To'),
      messageId: header(m, 'Message-ID'),
      references: header(m, 'References'),
      date: new Date(Number(m.internalDate)),
      unread: (m.labelIds || []).includes('UNREAD'),
      ...findParts(m.payload)
    }))
  };
}

export const modifyThread = (id, add = [], remove = []) =>
  gfetch(`${GM}/threads/${id}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } });
export const trashThread = (id) => gfetch(`${GM}/threads/${id}/trash`, { method: 'POST' });
export const untrashThread = (id) => gfetch(`${GM}/threads/${id}/untrash`, { method: 'POST' });

const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);
const oneLine = (s = '') => s.replace(/[\r\n]+/g, ' ').trim(); // no header injection via newlines

export async function sendMail({ to, cc, subject, body, threadId, inReplyTo, references }) {
  const lines = [
    `To: ${oneLine(to)}`,
    cc ? `Cc: ${oneLine(cc)}` : null,
    `Subject: ${encodeHeader(oneLine(subject))}`,
    inReplyTo ? `In-Reply-To: ${oneLine(inReplyTo)}` : null,
    inReplyTo ? `References: ${oneLine(`${references || ''} ${inReplyTo}`)}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body.replace(/\r?\n/g, '\r\n')
  ].filter((l) => l !== null);
  return gfetch(`${GM}/messages/send`, { method: 'POST', body: { raw: b64urlEncode(lines.join('\r\n')), threadId } });
}

// ================= Calendar =================

const CAL = '/calendar/v3';

export async function listCalendars() {
  const r = await gfetch(`${CAL}/users/me/calendarList?minAccessRole=reader`);
  return (r.items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, selected: c.selected !== false, primary: !!c.primary, canEdit: ['owner', 'writer'].includes(c.accessRole) }));
}

export async function listEvents({ from = new Date(), days = 14 } = {}) {
  const cals = (await listCalendars()).filter((c) => c.selected);
  const timeMin = from.toISOString();
  const timeMax = new Date(from.getTime() + days * 86400000).toISOString();
  const lists = await Promise.all(cals.map((c) =>
    gfetch(`${CAL}/calendars/${encodeURIComponent(c.id)}/events?${qs({ timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250 })}`)
      .then((r) => (r.items || []).filter((e) => e.status !== 'cancelled').map((e) => toEvent(e, c)))
      .catch(() => [])));
  return lists.flat().sort((a, b) => a.start - b.start);
}

function toEvent(e, cal) {
  const allDay = !!e.start.date;
  const start = allDay ? new Date(`${e.start.date}T00:00`) : new Date(e.start.dateTime);
  const end = allDay ? new Date(`${e.end.date}T00:00`) : new Date(e.end.dateTime);
  return {
    id: e.id, calendarId: cal.id, calendar: cal.name, color: cal.color, canEdit: cal.canEdit,
    title: e.summary || '(no title)', start, end, allDay,
    location: e.location || '', description: e.description || '',
    meet: e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || '',
    link: e.htmlLink
  };
}

// Natural language: "Lunch with Ria tomorrow 1pm at Toit"
export const quickAddEvent = (text) =>
  gfetch(`${CAL}/calendars/primary/events/quickAdd?${qs({ text })}`, { method: 'POST' });

export function createEvent({ title, start, end, allDay, location, description }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: title, location, description,
    start: allDay ? { date: start.slice(0, 10) } : { dateTime: new Date(start).toISOString(), timeZone: tz },
    end: allDay ? { date: nextDay(end || start) } : { dateTime: new Date(end || start).toISOString(), timeZone: tz }
  };
  return gfetch(`${CAL}/calendars/primary/events`, { method: 'POST', body });
}
function nextDay(d) {
  const x = new Date(`${d.slice(0, 10)}T00:00`);
  x.setDate(x.getDate() + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const deleteEvent = (calendarId, id) =>
  gfetch(`${CAL}/calendars/${encodeURIComponent(calendarId)}/events/${id}`, { method: 'DELETE' });

// ================= Tasks =================

const TK = '/tasks/v1';

export async function taskLists() {
  const r = await gfetch(`${TK}/users/@me/lists?maxResults=100`);
  return (r.items || []).map((l) => ({ id: l.id, title: l.title }));
}

export async function listTasks(listId, { showCompleted = false } = {}) {
  const r = await gfetch(`${TK}/lists/${listId}/tasks?${qs({ showCompleted, showHidden: showCompleted, maxResults: 100 })}`);
  return (r.items || []).filter((t) => t.title).map((t) => toTask(t, listId));
}

const toTask = (t, listId) => ({
  id: t.id, listId, title: t.title, notes: t.notes || '',
  // Google Tasks keeps only the date; read it as a local date so it never shifts a day.
  due: t.due ? new Date(`${t.due.slice(0, 10)}T00:00`) : null,
  done: t.status === 'completed', parent: t.parent || null, position: t.position
});

export async function allOpenTasks() {
  const lists = await taskLists();
  const all = await Promise.all(lists.map((l) => listTasks(l.id).then((ts) => ts.map((t) => ({ ...t, list: l.title })))));
  return all.flat();
}

const dueValue = (date) => (date ? `${date}T00:00:00.000Z` : null);

export const addTask = (listId, { title, notes, due }) =>
  gfetch(`${TK}/lists/${listId}/tasks`, { method: 'POST', body: { title, notes: notes || undefined, due: dueValue(due) || undefined } }).then((t) => toTask(t, listId));

export const updateTask = (listId, id, patch) => {
  const body = { ...patch };
  if ('due' in body) body.due = dueValue(body.due);
  if ('done' in body) { body.status = body.done ? 'completed' : 'needsAction'; if (!body.done) body.completed = null; delete body.done; }
  return gfetch(`${TK}/lists/${listId}/tasks/${id}`, { method: 'PATCH', body });
};

export const deleteTask = (listId, id) => gfetch(`${TK}/lists/${listId}/tasks/${id}`, { method: 'DELETE' });

// ================= Drive app folder (synced notes) =================
// A hidden per-app folder in your Drive: only this app can see it.

// Any JSON file in the app folder: notes, jams, ...
async function appFileId(name) {
  const key = `fileId:${name}`;
  const known = load(key);
  if (known) return known;
  const r = await gfetch(`/drive/v3/files?${qs({ spaces: 'appDataFolder', q: `name='${name}'`, fields: 'files(id)' })}`);
  const id = r.files?.[0]?.id || null;
  if (id) save(key, id);
  return id;
}

export async function readAppFile(name, fallback) {
  const id = await appFileId(name);
  if (!id) return fallback;
  const data = await gfetch(`/drive/v3/files/${id}?alt=media`);
  return typeof data === 'string' ? JSON.parse(data || 'null') ?? fallback : data;
}

export async function writeAppFile(name, value) {
  const id = await appFileId(name);
  const json = JSON.stringify(value);
  if (id) {
    return gfetch(`/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', body: json, raw: true, headers: { 'Content-Type': 'application/json' } });
  }
  const boundary = `hub${Date.now()}`;
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify({ name, parents: ['appDataFolder'] }),
    `--${boundary}`, 'Content-Type: application/json', '', json, `--${boundary}--`
  ].join('\r\n');
  const f = await gfetch('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body, raw: true, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } });
  save(`fileId:${name}`, f.id);
  return f;
}

export const readNotes = () => readAppFile('hub-notes.json', []).then((d) => (Array.isArray(d) ? d : []));
export const writeNotes = (notes) => writeAppFile('hub-notes.json', notes);