// Tasks: Google Tasks (the same lists you see in Gmail, Calendar and the Tasks app).
import { h, clear, empty, loading, errorBox, dayLabel, toast, formModal, btn, startOfDay, toDateInput } from '../ui.js';
import * as G from '../google.js';
import { cached, cache, load, save } from '../store.js';
import { getToken } from '../auth.js';

export function render(root, ctx) {
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div');
  const title = h('input', { type: 'text', class: 'search', placeholder: 'Add a task…', 'aria-label': 'New task', autocomplete: 'off', required: true });
  const due = h('input', { type: 'date', class: 'date-input', 'aria-label': 'Due date' });
  const addForm = h('form', { class: 'search-form' }, title, due, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'));
  let lists = cached('tasklists') || [];
  let current = load('taskList');
  let showDone = false;

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!title.value.trim() || !current) return;
    try {
      await G.addTask(current, { title: title.value.trim(), due: due.value || null });
      title.value = ''; due.value = '';
      toast('Task added');
      loadTasks();
    } catch (err) { ctx.handleError(err); }
  });

  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'QUEST LOG'), h('h1', { class: 'page-title' }, 'Tasks')),
      h('div', { class: 'head-actions' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { showDone = e.target.checked; loadTasks(); } }), h('span', {}, 'Show done')))),
    tabs, addForm, body);

  const drawTabs = () => clear(tabs, lists.map((l) =>
    h('button', { class: `tab ${l.id === current ? 'is-active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(l.id === current), onclick: () => { current = l.id; save('taskList', current); drawTabs(); loadTasks(); } }, l.title)));

  function draw(tasks) {
    const today = startOfDay();
    const tomorrow = new Date(today.getTime() + 86400000);
    const open = tasks.filter((t) => !t.done);
    const groups = [
      ['Overdue', open.filter((t) => t.due && t.due < today), 'tag-danger'],
      ['Today', open.filter((t) => t.due && t.due >= today && t.due < tomorrow), 'tag-gold'],
      ['Upcoming', open.filter((t) => t.due && t.due >= tomorrow).sort((a, b) => a.due - b.due), ''],
      ['No date', open.filter((t) => !t.due), ''],
      ['Done', showDone ? tasks.filter((t) => t.done) : [], '']
    ].filter(([, items]) => items.length);
    clear(body, groups.length ? groups.map(([label, items]) =>
      h('section', { class: 'task-group' },
        h('h2', { class: 'pixel-label group-label' }, `${label.toUpperCase()} (${items.length})`),
        h('ul', { class: 'list' }, items.map((t) => taskRow(t, ctx, loadTasks))))) : empty('No tasks here. Add one above.'));
  }

  async function loadTasks() {
    if (!current) return;
    const key = `tasks:${current}:${showDone}`;
    const prev = cached(key);
    if (prev) draw(prev); else clear(body, loading());
    try {
      const tasks = await G.listTasks(current, { showCompleted: showDone });
      cache(key, tasks);
      draw(tasks);
    } catch (err) {
      if (!ctx.handleError(err, true)) clear(body, errorBox(err, loadTasks));
    }
  }

  (async () => {
    if (!getToken()) { clear(body, ctx.signInPrompt()); addForm.hidden = true; return; }
    if (lists.length) { current = lists.some((l) => l.id === current) ? current : lists[0].id; drawTabs(); loadTasks(); }
    try {
      lists = await G.taskLists();
      cache('tasklists', lists);
      if (!lists.some((l) => l.id === current)) current = lists[0]?.id;
      drawTabs();
      loadTasks();
    } catch (err) {
      if (!ctx.handleError(err, true)) clear(body, errorBox(err, () => render(root, ctx)));
    }
  })();
}

function taskRow(t, ctx, reload) {
  const overdue = !t.done && t.due && t.due < startOfDay();
  const box = h('input', { type: 'checkbox', checked: t.done, 'aria-label': `Done: ${t.title}` });
  box.addEventListener('change', async () => {
    const done = box.checked;
    row.classList.toggle('is-done', done);
    try {
      await G.updateTask(t.listId, t.id, { done });
      if (done) toast('Task done', { undo: async () => { await G.updateTask(t.listId, t.id, { done: false }); reload(); } });
      setTimeout(reload, 350);
    } catch (err) { box.checked = !done; row.classList.toggle('is-done', !done); ctx.handleError(err); }
  });
  const row = h('li', { class: `row task-row ${t.done ? 'is-done' : ''} ${t.parent ? 'is-sub' : ''}` },
    h('label', { class: 'check' }, box),
    h('button', { class: 'row-main link-row', type: 'button', onclick: () => editTask(t, ctx, reload) },
      h('span', { class: 'row-title' }, t.title),
      t.notes ? h('span', { class: 'row-sub' }, t.notes.split('\n')[0]) : null),
    t.due ? h('span', { class: `tag ${overdue ? 'tag-danger' : ''}` }, dayLabel(t.due).toUpperCase()) : null);
  return row;
}

function editTask(t, ctx, reload) {
  formModal('Edit task', [
    { name: 'title', label: 'Title', value: t.title, required: true },
    { name: 'due', label: 'Due', type: 'date', value: t.due ? toDateInput(t.due) : '' },
    { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes, rows: 5 }
  ], async (d) => {
    await G.updateTask(t.listId, t.id, { title: d.title, notes: d.notes, due: d.due || null });
    toast('Task saved');
    reload();
  });
  const actions = document.querySelector('#modal .form-actions');
  actions.prepend(btn('Delete', async () => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try { await G.deleteTask(t.listId, t.id); document.querySelector('#modal').close(); toast('Task deleted'); reload(); } catch (err) { ctx.handleError(err); }
  }, 'btn-danger push-left'));
}
