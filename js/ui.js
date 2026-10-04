import { signIn } from './auth.js';

// Small DOM + formatting helpers shared by every view. Text always goes in as
// text nodes, never innerHTML, so mail subjects or repo names can't inject markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- Panels ----------

export function panel(title, { action, meta, cls } = {}, ...body) {
  return h('section', { class: `panel ${cls || ''}` },
    h('header', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, title),
      meta ? h('span', { class: 'panel-meta' }, meta) : null,
      action || null),
    h('div', { class: 'panel-body' }, ...body));
}

export const empty = (text) => h('p', { class: 'empty' }, text);
export const loading = (text = 'Loading') => h('p', { class: 'loading' }, h('span', { class: 'blink' }, '_'), ' ', text);

export function errorBox(err, retry) {
  const msg = err?.message || String(err);
  const auth = err?.name === 'AuthError';
  return h('div', { class: 'error-box' },
    h('p', {}, msg),
    auth ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => signIn({ silent: true }) }, 'Reconnect')
      : retry ? h('button', { class: 'btn btn-small', type: 'button', onclick: retry }, 'Try again') : null);
}

export const btn = (label, onclick, cls = '') =>
  h('button', { class: `btn ${cls}`, type: 'button', onclick }, label);

// ---------- Toast ----------

let toastTimer;
export function toast(text, { undo } = {}) {
  const el = $('#toast');
  clear(el, h('span', {}, text), undo ? h('button', { class: 'link-btn', type: 'button', onclick: () => { el.hidden = true; undo(); } }, 'Undo') : null);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 6000 : 3000);
}

// ---------- Modal (one shared <dialog>) ----------

export function modal(title, body, { wide } = {}) {
  const dlg = $('#modal');
  dlg.classList.toggle('is-wide', !!wide);
  clear(dlg,
    h('header', { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, 'X')),
    h('div', { class: 'modal-body' }, body));
  if (!dlg.open) dlg.showModal();
  return dlg;
}
export const closeModal = () => $('#modal').close();

// A form inside the modal. fields: [{name, label, type, value, required, options, placeholder}]
export function formModal(title, fields, onSubmit, { submitLabel = 'Save' } = {}) {
  const form = h('form', { class: 'form' },
    fields.map((f) => {
      const id = `f-${f.name}`;
      let input;
      if (f.type === 'textarea') input = h('textarea', { id, name: f.name, rows: f.rows || 6, placeholder: f.placeholder, required: f.required }, f.value || '');
      else if (f.type === 'select') input = h('select', { id, name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: v === f.value }, l)));
      else if (f.type === 'checkbox') input = h('input', { id, name: f.name, type: 'checkbox', checked: !!f.value });
      else input = h('input', { id, name: f.name, type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder, required: f.required, autocomplete: 'off' });
      return h('label', { class: `field ${f.type === 'checkbox' ? 'field-check' : ''}`, for: id }, h('span', { class: 'field-label' }, f.label), input, f.hint ? h('span', { class: 'field-hint' }, f.hint) : null);
    }),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      data[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
    }
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      await onSubmit(data);
      closeModal();
    } catch (err) {
      toast(err.message || String(err));
    } finally {
      submit.disabled = false;
    }
  });
  modal(title, form);
  form.querySelector('input:not([type=checkbox]), textarea')?.focus();
}

// ---------- Dates ----------

const DAY = 86400000;
export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function dayLabel(d) {
  const diff = Math.round((startOfDay(d) - startOfDay()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export const timeLabel = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function ago(d) {
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < DAY / 1000) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * DAY / 1000) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// "Mon 6 Oct, 3:30 PM" style input value for <input type=datetime-local>
export function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const toDateInput = (d) => toLocalInput(d).slice(0, 10);
