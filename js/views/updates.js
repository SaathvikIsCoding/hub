// Updates: GitHub notifications, your recent activity and your repos.
import { h, clear, panel, empty, loading, errorBox, ago, toast, btn } from '../ui.js';
import * as GH from '../github.js';

export function render(root, ctx) {
  const notes = h('div'), activity = h('div'), repos = h('div');
  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'NEWS FEED'), h('h1', { class: 'page-title' }, 'Updates')),
      h('div', { class: 'head-actions' }, h('a', { class: 'btn', href: `https://github.com/${GH.ghUser()}`, target: '_blank', rel: 'noopener' }, 'Open GitHub'))),
    h('div', { class: 'grid grid-2' },
      panel('Notifications', {}, notes),
      panel('Your activity', {}, activity)),
    panel('Repositories', { meta: 'Most recently pushed' }, repos));

  loadNotifications(notes, ctx);
  loadActivity(activity);
  loadRepos(repos);
}

async function loadNotifications(slot, ctx) {
  if (!GH.ghToken()) {
    clear(slot, h('p', { class: 'empty' }, 'Add a GitHub token in ', h('a', { href: '#/settings' }, 'Settings'), ' to see issues, pull requests, mentions and review requests here.'));
    return;
  }
  clear(slot, loading());
  try {
    const list = await GH.notifications();
    ctx.setBadge('updates', list.length);
    clear(slot,
      list.length ? h('div', { class: 'panel-tools' }, btn('Mark all read', async () => {
        try { await GH.markAllRead(); toast('All caught up'); loadNotifications(slot, ctx); } catch (err) { toast(err.message); }
      }, 'btn-small')) : null,
      list.length ? h('ul', { class: 'list' }, list.map((n) => {
        const row = h('li', { class: 'row' },
          h('span', { class: 'tag' }, reason(n.reason)),
          h('div', { class: 'row-main' },
            h('a', { class: 'row-title', href: GH.webUrl(n.subject, n.repository), target: '_blank', rel: 'noopener', onclick: () => GH.markNotificationRead(n.id).catch(() => {}) }, n.subject.title),
            h('span', { class: 'row-sub' }, `${n.repository.full_name}, ${n.subject.type}`)),
          h('span', { class: 'row-meta' }, ago(new Date(n.updated_at))),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mark read', title: 'Mark read', onclick: async () => { row.remove(); await GH.markNotificationRead(n.id).catch(() => {}); } }, 'OK'));
        return row;
      })) : empty('No unread notifications.'));
  } catch (err) {
    clear(slot, errorBox(err, () => loadNotifications(slot, ctx)));
  }
}

const reason = (r) => ({ review_requested: 'REVIEW', mention: 'MENTION', assign: 'ASSIGNED', author: 'YOURS', comment: 'COMMENT', ci_activity: 'CI', security_alert: 'SECURITY', subscribed: 'WATCHING', team_mention: 'TEAM', state_change: 'STATE' }[r] || r.toUpperCase());

async function loadActivity(slot) {
  clear(slot, loading());
  try {
    const evs = (await GH.events()).slice(0, 15).map((e) => ({ ...GH.describeEvent(e), at: new Date(e.created_at) }));
    clear(slot, evs.length ? h('ul', { class: 'list' }, evs.map((e) =>
      h('li', { class: 'row' },
        h('div', { class: 'row-main' },
          h('a', { class: 'row-title', href: e.url, target: '_blank', rel: 'noopener' }, e.text),
          e.detail ? h('span', { class: 'row-sub' }, e.detail) : null),
        h('span', { class: 'row-meta' }, ago(e.at))))) : empty('No recent activity.'));
  } catch (err) {
    clear(slot, errorBox(err, () => loadActivity(slot)));
  }
}

async function loadRepos(slot) {
  clear(slot, loading());
  try {
    const list = await GH.repos();
    clear(slot, h('div', { class: 'repo-grid' }, list.map((r) =>
      h('a', { class: 'repo', href: r.html_url, target: '_blank', rel: 'noopener' },
        h('span', { class: 'repo-name' }, r.name, r.private ? h('span', { class: 'tag' }, 'PRIVATE') : null),
        h('span', { class: 'row-sub' }, r.description || 'No description'),
        h('span', { class: 'repo-meta' },
          r.language ? h('span', {}, r.language) : null,
          h('span', {}, `Pushed ${ago(new Date(r.pushed_at))}`),
          r.stargazers_count ? h('span', {}, `${r.stargazers_count} stars`) : null,
          r.has_pages ? h('span', { class: 'tag tag-accent' }, 'LIVE SITE') : null)))));
  } catch (err) {
    clear(slot, errorBox(err, () => loadRepos(slot)));
  }
}
