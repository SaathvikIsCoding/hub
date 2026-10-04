// Portfolio: your live portfolio at a glance (read straight from its content.json),
// shortcuts to edit it, its deploy status and latest changes.
import { h, clear, panel, empty, loading, errorBox, ago } from '../ui.js';
import * as GH from '../github.js';
import { CONFIG } from '../../config.js';
import { cached, cache } from '../store.js';

const site = CONFIG.portfolioUrl;
const abs = (p) => (/^https?:/.test(p) ? p : site + p);

export function render(root) {
  const head = h('div'), stats = h('div'), projects = h('div'), certs = h('div'), commits = h('div'), deploy = h('span', { class: 'panel-meta' });

  clear(root,
    h('div', { class: 'page-head page-head-row' },
      h('div', {}, h('p', { class: 'pixel-label' }, 'PLAYER 1'), h('h1', { class: 'page-title' }, 'Portfolio')),
      h('div', { class: 'head-actions' },
        h('a', { class: 'btn btn-primary', href: site, target: '_blank', rel: 'noopener' }, 'View site'),
        h('a', { class: 'btn', href: `${site}admin/`, target: '_blank', rel: 'noopener' }, 'Edit content'),
        h('a', { class: 'btn', href: `${site}resume.html`, target: '_blank', rel: 'noopener' }, 'Resume'))),
    head, stats,
    panel('Projects', {}, projects),
    h('div', { class: 'grid grid-2' },
      panel('Certifications', {}, certs),
      panel('Latest changes', { action: deploy }, commits)));

  const draw = (c) => {
    const p = c.profile || {};
    clear(head, h('div', { class: 'profile' },
      p.photo ? h('img', { class: 'profile-photo', src: abs(p.photo), alt: '', width: 88, height: 88 }) : null,
      h('div', {},
        h('h2', { class: 'profile-name' }, p.name || ''),
        h('p', { class: 'profile-role' }, p.tagline || p.role || ''),
        h('p', { class: 'row-meta' }, p.location || ''),
        h('p', { class: 'profile-links' }, (c.socials || []).map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label))))));
    clear(stats, h('div', { class: 'stats' },
      [['Projects', c.projects], ['Experience', c.experience], ['Skills', c.skills], ['Certifications', c.certifications]]
        .map(([label, arr]) => h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, (arr || []).length), h('span', { class: 'pixel-label' }, label.toUpperCase())))));
    clear(projects, (c.projects || []).length ? h('div', { class: 'card-grid' }, c.projects.map((pr) =>
      h('a', { class: 'card', href: `${site}project.html?id=${encodeURIComponent(pr.id || '')}`, target: '_blank', rel: 'noopener' },
        pr.image ? h('img', { class: `card-img ${pr.pixelArt ? 'is-pixel' : ''}`, src: abs(pr.image), alt: '', loading: 'lazy' }) : null,
        h('span', { class: 'card-title' }, (pr.title || '').toUpperCase()),
        h('span', { class: 'row-sub' }, pr.description || ''),
        pr.period ? h('span', { class: 'row-meta' }, pr.period) : null))) : empty('No projects yet.'));
    clear(certs, (c.certifications || []).length ? h('ul', { class: 'list' }, c.certifications.map((ce) =>
      h('li', { class: 'row' }, h('div', { class: 'row-main' },
        h('a', { class: 'row-title', href: `${site}certificate.html?id=${encodeURIComponent(ce.id || '')}`, target: '_blank', rel: 'noopener' }, ce.name),
        h('span', { class: 'row-sub' }, [ce.issuer, ce.date].filter(Boolean).join(', ')))))) : empty('No certifications yet.'));
  };

  const prev = cached('portfolio');
  if (prev) draw(prev); else clear(projects, loading());
  fetch(`${site}content/content.json`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`Couldn't load the portfolio (${r.status})`); return r.json(); })
    .then((c) => { cache('portfolio', c); draw(c); })
    .catch((err) => { if (!prev) clear(projects, errorBox(err, () => render(root))); });

  GH.commits(CONFIG.portfolioRepo, 6).then((list) => clear(commits, h('ul', { class: 'list' }, list.map((c) =>
    h('li', { class: 'row' }, h('div', { class: 'row-main' },
      h('a', { class: 'row-title', href: c.html_url, target: '_blank', rel: 'noopener' }, c.commit.message.split('\n')[0]),
      h('span', { class: 'row-sub' }, c.commit.author?.name || '')),
    h('span', { class: 'row-meta' }, ago(new Date(c.commit.author?.date)))))))).catch((err) => clear(commits, errorBox(err)));

  if (GH.ghToken()) {
    GH.pagesBuild(CONFIG.portfolioRepo).then((b) => {
      const ok = b.status === 'built';
      clear(deploy, h('span', { class: `tag ${ok ? 'tag-accent' : b.status === 'errored' ? 'tag-danger' : 'tag-gold'}` }, ok ? `LIVE ${ago(new Date(b.updated_at)).toUpperCase()}` : b.status.toUpperCase()));
    }).catch(() => {});
  }
}
