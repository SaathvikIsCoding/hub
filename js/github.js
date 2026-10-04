// GitHub REST client. Works without a token (public activity, 60 requests/hour);
// a personal token (Settings) adds notifications, private activity and Pages status.
import { load } from './store.js';
import { CONFIG } from '../config.js';

export const ghUser = () => load('githubUser') || CONFIG.githubUser;
export const ghToken = () => load('githubToken') || '';

async function gh(path, { method = 'GET', body } = {}) {
  const token = ghToken();
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 205 || res.status === 204) return null;
  if (!res.ok) {
    let msg = `GitHub: ${res.status}`;
    try { msg = `GitHub: ${(await res.json()).message}`; } catch { /* ignore */ }
    if (res.status === 401) msg = 'GitHub token was rejected. Update it in Settings.';
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') msg = 'GitHub rate limit reached. Add a token in Settings for more requests.';
    throw new Error(msg);
  }
  return res.json();
}

export const notifications = () => gh('/notifications?per_page=50');
export const markNotificationRead = (id) => gh(`/notifications/threads/${id}`, { method: 'PATCH' });
export const markAllRead = () => gh('/notifications', { method: 'PUT', body: {} });

export const events = (user = ghUser()) =>
  gh(`/users/${user}/${ghToken() ? 'events' : 'events/public'}?per_page=30`);

export const repos = (user = ghUser()) =>
  gh(ghToken() ? '/user/repos?sort=pushed&per_page=12&affiliation=owner' : `/users/${user}/repos?sort=pushed&per_page=12`);

export const commits = (repo, n = 6) => gh(`/repos/${repo}/commits?per_page=${n}`);
export const pagesBuild = (repo) => gh(`/repos/${repo}/pages/builds/latest`);

// API URLs in notifications → the page you'd open in the browser.
export function webUrl(subject, repo) {
  const api = subject?.url || subject?.latest_comment_url;
  if (!api) return repo.html_url;
  return api
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/')
    .replace(/\/commits\/([0-9a-f]+)$/, '/commit/$1')
    .replace(/\/releases\/\d+$/, '/releases');
}

// One short line per activity event.
export function describeEvent(e) {
  const repo = e.repo.name;
  const p = e.payload || {};
  switch (e.type) {
    case 'PushEvent': {
      const n = p.size ?? p.commits?.length ?? 1;
      const msg = p.commits?.[p.commits.length - 1]?.message?.split('\n')[0];
      return { text: `Pushed ${n} commit${n === 1 ? '' : 's'} to ${repo}`, detail: msg, url: `https://github.com/${repo}/commits` };
    }
    case 'CreateEvent': return { text: `Created ${p.ref_type}${p.ref ? ` ${p.ref}` : ''} in ${repo}`, url: `https://github.com/${repo}` };
    case 'DeleteEvent': return { text: `Deleted ${p.ref_type} ${p.ref} in ${repo}`, url: `https://github.com/${repo}` };
    case 'IssuesEvent': return { text: `${cap(p.action)} issue in ${repo}`, detail: p.issue?.title, url: p.issue?.html_url };
    case 'IssueCommentEvent': return { text: `Commented on ${repo}`, detail: p.issue?.title, url: p.comment?.html_url };
    case 'PullRequestEvent': return { text: `${cap(p.action)} pull request in ${repo}`, detail: p.pull_request?.title, url: p.pull_request?.html_url };
    case 'WatchEvent': return { text: `Starred ${repo}`, url: `https://github.com/${repo}` };
    case 'ForkEvent': return { text: `Forked ${repo}`, url: p.forkee?.html_url };
    case 'ReleaseEvent': return { text: `Released ${p.release?.tag_name} in ${repo}`, url: p.release?.html_url };
    case 'PublicEvent': return { text: `Made ${repo} public`, url: `https://github.com/${repo}` };
    default: return { text: `${e.type.replace(/Event$/, '')} in ${repo}`, url: `https://github.com/${repo}` };
  }
}
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
