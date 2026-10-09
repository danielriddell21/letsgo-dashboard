// The overview: modules the viewer chooses and orders in Settings.

import * as core from '../core.js';
import { h, icon } from '../dom.js';
import { settings } from '../store.js';
import { ui } from '../state.js';
import { watched, pinned, project, have, ensure, ensureAudits } from '../projects.js';
import {
  box, table, flash, blank, pageHead, spinner, stateEl, statusOf, verdictState, vulnLink, releaseLink,
  projectHref, projectName, labelEl, youUse, haveSelect, supportLabel,
} from '../ui.js';
import { verifyModule } from './verify.js';
import { searchModule } from './search.js';

function nothingPinned() {
  return box({
    title: 'Nothing pinned yet',
    body: h('div', { class: 'blankslate' },
      h('p', {}, "Search for a repository above and pin it. You'll see which version to use, whether yours needs an update, and, for repositories released with letsgo, what each release recorded."),
      h('p', { class: 'small' }, 'Try ', h('button', { class: 'btn btn-sm', 'data-action': 'add-example' }, 'pinning danielriddell21/letsgo'),
        ' · ', h('a', { href: '#/add' }, "browse an owner's repositories"))),
  });
}

// prime starts the loads the overview needs for a project.
function prime(p) {
  if (p.status !== 'ready') return;
  ensureAudits(p);
  ensure(p, core.latestStable(p.releases), 'manifest');
  ensure(p, have(p), 'manifest');
}

function attentionModule() {
  const items = [];
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status !== 'ready') continue;
    const v = core.verdict(p.releases, have(p));
    if (v.kind !== 'danger') continue;
    const action = v.target ? releaseLink(p, v.target.tag, h('span', { class: 'btn btn-sm' }, `View ${v.target.tag}`)) : null;
    items.push(flash('danger', 'alert', [h('b', {}, p.id), `: ${v.title}. ${v.text}`], action));
  }
  return items;
}

function nameCell(p) {
  const avatar = p.meta?.avatar ? h('img', { class: 'avatar avatar-sm', src: p.meta.avatar, alt: '' }) : null;
  return h('td', {},
    h('div', { class: 'name-cell' },
      h('a', { href: projectHref(p), class: 'row' }, avatar, h('span', {}, projectName(p))),
      p.meta?.private ? labelEl('Private') : null,
      supportLabel(p)));
}

function messageRow(p, ...message) {
  return h('tr', {}, nameCell(p), h('td', { colspan: '3' }, ...message));
}

function projectRow(p) {
  if (p.status === 'error') {
    return messageRow(p, stateEl('danger', p.error), ' ', h('button', { class: 'btn btn-sm', 'data-action': 'retry', 'data-project': p.id }, 'Retry'));
  }
  if (p.status !== 'ready') return messageRow(p, spinner());
  const latest = core.latestStable(p.releases) || p.releases[0];
  if (!latest) return messageRow(p, h('span', { class: 'muted' }, 'No releases.'));
  const mine = have(p);
  const status = mine ? verdictState(core.verdict(p.releases, mine)) : statusOf(latest);
  return h('tr', {}, nameCell(p),
    h('td', {}, haveSelect(p)),
    h('td', { class: 'nowrap' }, releaseLink(p, latest.tag, h('span', { class: 'mono' }, latest.tag)), h('div', { class: 'small muted' }, core.shortDate(latest.published))),
    h('td', {}, status));
}

function projectsModule() {
  const list = pinned();
  return box({
    title: 'Pinned projects',
    counter: list.length,
    actions: h('a', { class: 'btn btn-sm', href: '#/add' }, icon('plus'), 'Pin a project'),
    body: table(['Project', 'You use', 'Latest', 'Status'], list.map(projectRow), true),
  });
}

function recentModule() {
  const all = [];
  for (const spec of watched()) {
    const p = project(spec);
    for (const r of p.releases.slice(0, 10)) all.push([p, r]);
  }
  all.sort((a, b) => String(b[1].published).localeCompare(String(a[1].published)));
  const rows = all.slice(0, 8).map(([p, r]) => h('div', { class: 'Box-row' },
    h('div', { class: 'Box-row-grow' }, releaseLink(p, r.tag, h('span', { class: 'mono' }, r.tag)), ' ', h('span', { class: 'muted' }, p.id)),
    h('span', { class: 'small muted' }, core.shortDate(r.published)),
    statusOf(r)));
  return box({ title: 'Recent releases', body: rows.length ? rows : h('div', { class: 'Box-row muted' }, 'No releases yet.') });
}

// ---------- advisories

function advisoryRows(p, r, a) {
  return (a.findings || []).map(f => {
    const fx = core.fixedIn(p.releases, r, f);
    return h('tr', {},
      h('td', {}, vulnLink(f.id)),
      h('td', {}, releaseLink(p, r.tag, p.id, ' ', h('span', { class: 'mono' }, r.tag)), youUse(p, r)),
      h('td', {}, h('code', {}, f.module), f.fixed ? [' ', h('span', { class: 'muted small' }, `fixed in ${f.fixed}`)] : null),
      h('td', { class: 'mono' }, fx ? fx.tag : h('span', { class: 'muted' }, 'none yet')),
      h('td', { class: 'nowrap small muted' }, core.shortDate(a.at)));
  });
}

function advisoriesFor(p, full, found) {
  if (p.status === 'loading' || p.status === 'idle') {
    found.loading = true;
    return;
  }
  ensureAudits(p);
  const targets = full ? p.releases : [have(p), core.latestStable(p.releases)].filter(Boolean);
  for (const r of new Set(targets)) {
    if (r.audit === undefined) {
      found.loading = true;
      continue;
    }
    const a = core.lastAudit(r);
    if (a?.status === 'affected') found.rows.push(...advisoryRows(p, r, a));
  }
}

function advisoriesEmpty(found, full) {
  if (found.loading) return [spinner(), ' Checking audits…'];
  if (full) return ['No release on this page has a known vulnerability.'];
  return ['Neither the versions you use nor the latest releases have a known vulnerability.'];
}

export function advisoriesModule(full) {
  const found = { rows: [], loading: false };
  for (const spec of watched()) advisoriesFor(project(spec), full, found);
  const body = found.rows.length
    ? table(['Advisory', 'Release', 'Module', 'Fixed in', 'Audited'], found.rows)
    : h('div', { class: 'Box-body muted' }, advisoriesEmpty(found, full));
  const b = box({
    title: 'Advisories',
    counter: found.rows.length || undefined,
    actions: full ? null : h('a', { class: 'small', href: '#/advisories' }, 'All releases'),
    body,
  });
  if (!full) return b;
  return [pageHead('Advisories', "From each release's latest audit (", h('code', {}, 'audit.json'), '), written by ', h('code', {}, 'letsgo audit'), '.'), b];
}

// ---------- dependencies

function dependencyRows(p, r, q) {
  const list = r.manifest?.modules?.list || [];
  return list.filter(m => m.path.includes(q)).map(m => h('tr', {},
    h('td', {}, releaseLink(p, r.tag, p.id, ' ', h('span', { class: 'mono' }, r.tag)), youUse(p, r)),
    h('td', {}, h('code', {}, m.path)),
    h('td', {}, h('code', {}, m.version))));
}

function dependenciesFor(p, q, found) {
  if (p.status !== 'ready') {
    found.loading = found.loading || p.status === 'loading';
    return;
  }
  for (const r of new Set([have(p), core.latestStable(p.releases)].filter(Boolean))) {
    ensure(p, r, 'manifest');
    if (r.manifest === undefined) found.loading = true;
    else if (q) found.rows.push(...dependencyRows(p, r, q));
  }
}

function dependenciesEmpty(found, q) {
  if (found.loading) return [spinner(), ' Reading manifests…'];
  if (q) return ['No version you use, and no latest release, depends on a matching module.'];
  return ['Type part of a module path.'];
}

export function dependenciesModule(full) {
  const q = ui.dep.trim();
  const found = { rows: [], loading: false };
  for (const spec of watched()) dependenciesFor(project(spec), q, found);
  const b = box({
    title: 'Who uses a module?',
    body: [
      h('div', { class: 'Box-body stack' },
        h('input', { class: 'form-control mono', id: 'dep-search', type: 'search', value: q, placeholder: 'Module path, e.g. golang.org/x/net', 'aria-label': 'Module path', 'data-input': 'dep' })),
      found.rows.length ? table(['Release', 'Module', 'Version'], found.rows) : null,
    ],
    footer: found.rows.length ? null : dependenciesEmpty(found, q),
  });
  if (!full) return b;
  return [pageHead('Dependencies', "Searches the dependency list each release's manifest records, in the version you use and the latest. Useful when an advisory lands before any audit has run."), b];
}

const MODULES = {
  search: searchModule,
  attention: attentionModule,
  projects: projectsModule,
  recent: recentModule,
  advisories: () => advisoriesModule(false),
  dependencies: () => dependenciesModule(false),
  verify: () => verifyModule(false),
};

export function overviewPage() {
  const specs = watched();
  for (const s of specs) prime(project(s));
  const on = settings.get().overview.filter(m => m.on);
  if (!on.length) return blank('Nothing to show', 'Every overview module is turned off. ', h('a', { href: '#/settings' }, 'Choose modules'));
  if (!specs.length) return [on.some(m => m.id === 'search') ? searchModule() : null, nothingPinned()];
  return on.map(m => MODULES[m.id]());
}
