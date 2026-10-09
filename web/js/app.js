// The dashboard: routing, loading projects from GitHub, and the pages.
// What the viewer sets up is kept in localStorage (see store.js); the server
// keeps nothing.

import * as core from './core.js';
import { settings, token, cache, forgetEverything, OVERVIEW_MODULES, PROJECT_SECTIONS } from './store.js';
import { github, ApiError } from './github.js';

const { esc } = core;
const $ = sel => document.querySelector(sel);

let CONFIG = { oauth: false, client_id: '', web: 'https://github.com', defaults: [], public_token: false, version: '' };
let USER = null;
const ui = { sel: {}, tab: 'download', fp: 'art', allVersions: false, dep: 'golang.org/x/', check: null, verifyLoading: false, addOwner: '', ownerRepos: null, ownerError: '', notice: '' };

// ---------- icons (16px, drawn for this page)

const svg = (path, cls = '') => `<svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${path}</svg>`;
const icons = {
  check: svg('<path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.03 4.97a.75.75 0 0 0-1.06 0L7 8.94 6.03 7.97a.75.75 0 0 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0 0-1.06Z"/>'),
  alert: svg('<path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 4Zm0 7.5a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"/>'),
  up: svg('<path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3.25a.75.75 0 0 0-.53.22l-2.5 2.5a.75.75 0 1 0 1.06 1.06l1.22-1.22v3.94a.75.75 0 0 0 1.5 0V6.81l1.22 1.22a.75.75 0 1 0 1.06-1.06l-2.5-2.5A.75.75 0 0 0 8 4.25Z"/>'),
  dot: svg('<circle cx="8" cy="8" r="4"/>'),
  lock: svg('<path d="M5 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 13 7.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-5A1.5 1.5 0 0 1 4.5 6Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0Z"/>'),
  plus: svg('<path d="M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z"/>'),
  copy: svg('<path d="M5 1.75A1.75 1.75 0 0 1 6.75 0h6.5A1.75 1.75 0 0 1 15 1.75v6.5A1.75 1.75 0 0 1 13.25 10h-6.5A1.75 1.75 0 0 1 5 8.25Zm1.75-.25a.25.25 0 0 0-.25.25v6.5c0 .14.11.25.25.25h6.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25ZM1 6.75C1 5.78 1.78 5 2.75 5h.75v1.5h-.75a.25.25 0 0 0-.25.25v6.5c0 .14.11.25.25.25h6.5a.25.25 0 0 0 .25-.25v-.75H11v.75A1.75 1.75 0 0 1 9.25 15h-6.5A1.75 1.75 0 0 1 1 13.25Z"/>'),
  arrowUp: svg('<path d="M8 3.5 3.5 8h3v4.5h3V8h3Z"/>'),
  arrowDown: svg('<path d="M8 12.5 12.5 8h-3V3.5h-3V8h-3Z"/>'),
  x: svg('<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>'),
};
const STATE_ICON = { success: icons.check, danger: icons.alert, attention: icons.up, secondary: icons.dot };
const state = (kind, label) => `<span class="state ${kind}">${STATE_ICON[kind] || icons.dot}${esc(label)}</span>`;

// ---------- theme and platform

function applyTheme() {
  const t = settings.get().theme;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = t === 'auto' ? (dark ? 'dark' : 'light') : t;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const PLATFORMS = ['darwin/arm64', 'darwin/amd64', 'linux/amd64', 'linux/arm64', 'windows/amd64', 'windows/arm64'];
function platform() {
  const p = settings.get().platform;
  if (p) return p;
  const ua = navigator.userAgent;
  return /Mac/.test(ua) ? 'darwin/arm64' : /Win/.test(ua) ? 'windows/amd64' : 'linux/amd64';
}

// ---------- projects

const projects = new Map();

function watched() {
  const s = settings.get();
  return (s.projects ?? CONFIG.defaults).map(core.parseSpec).filter(Boolean);
}
function setWatched(ids) { settings.set({ projects: ids }); }

function project(spec) {
  let p = projects.get(spec.id);
  if (!p) {
    p = { ...spec, status: 'idle', error: '', meta: null, releases: [], byTag: {}, other: 0 };
    projects.set(spec.id, p);
    loadProject(p);
  }
  return p;
}

async function loadProject(p, fresh) {
  p.status = 'loading';
  schedule();
  try {
    const [meta, list] = await Promise.all([
      github.repo(p.owner, p.repo).catch(e => {
        if (e.status === 404) throw new ApiError(404, `${p.owner}/${p.repo} doesn't exist, or your GitHub account can't read it.`);
        throw e;
      }),
      github.releases(p.owner, p.repo, fresh),
    ]);
    const releases = [];
    for (const x of list) {
      if (x.draft) continue;
      const version = core.parseTag(x.tag, p.prefix);
      if (!version) continue;
      releases.push({
        tag: x.tag, version, prerelease: version.pre.length > 0, retracted: core.readNotice(x.body),
        url: /^https:\/\//.test(x.url) ? x.url : '', published: x.published, assets: x.assets,
        hasManifest: 'letsgo.json' in x.assets, manifest: undefined, audit: 'audit.json' in x.assets ? undefined : null,
      });
    }
    releases.sort((a, b) => core.compareVersions(b.version, a.version));
    p.meta = meta;
    p.other = releases.filter(r => !r.hasManifest).length;
    p.releases = releases.filter(r => r.hasManifest);
    p.byTag = Object.fromEntries(p.releases.map(r => [r.tag, r]));
    p.status = 'ready';
    p.error = '';
  } catch (e) {
    p.status = 'error';
    p.error = e.message;
  }
  schedule();
}

// A few downloads at a time, so a long release list doesn't flood GitHub.
let active = 0;
const queue = [];
function limited(fn) {
  return new Promise((resolve, reject) => { queue.push(() => fn().then(resolve, reject)); pump(); });
}
function pump() {
  while (active < 6 && queue.length) {
    active++;
    queue.shift()().finally(() => { active--; pump(); });
  }
}

const inflight = new Map();
// ensure loads a release's manifest or audit once, then re-renders.
function ensure(p, r, what) {
  if (!r) return;
  const key = `${p.id}|${r.tag}|${what}`;
  if (what === 'manifest' && r.manifest !== undefined) return;
  if (what === 'audit' && r.audit !== undefined) return;
  if (inflight.has(key)) return;
  const job = limited(async () => {
    try {
      if (what === 'manifest') {
        const { text, sha256 } = await github.asset(p.owner, p.repo, r.assets['letsgo.json']);
        r.manifest = JSON.parse(text);
        r.sha256 = sha256;
        const d = Uint8Array.from(sha256.match(/../g), b => parseInt(b, 16));
        r.art = core.randomart(d, core.randomartTitle(r.tag));
        r.words = core.pgpWords(d);
      } else {
        const { text } = await github.asset(p.owner, p.repo, r.assets['audit.json']);
        r.audit = JSON.parse(text);
      }
    } catch (e) {
      if (what === 'manifest') { r.manifest = null; r.manifestError = e.message; } else { r.audit = null; }
    }
    inflight.delete(key);
    schedule();
  });
  inflight.set(key, job);
}
function ensureAudits(p) { for (const r of p.releases) if (r.audit === undefined) ensure(p, r, 'audit'); }
const have = p => p.byTag[settings.get().have[p.id]] || null;

// ---------- rendering

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; render(); });
}

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (h.startsWith('p/')) return { name: 'project', id: h.slice(2) };
  return { name: h || 'overview' };
}

function render() {
  applyTheme();
  const r = route();
  for (const a of document.querySelectorAll('#nav a')) a.setAttribute('aria-current', a.dataset.route === (r.name === 'overview' ? '' : r.name) ? 'page' : 'false');
  renderAccount();
  $('#footer').innerHTML = `<span>letsgo dashboard ${esc(CONFIG.version)}</span><span>Your settings and token are kept in this browser only.</span><a href="#/settings">Settings</a><a href="https://github.com/danielriddell21/letsgo" target="_blank" rel="noopener">letsgo</a>`;

  // Keep focus and the cursor in a text field across a re-render.
  const focused = document.activeElement && document.activeElement.id;
  const caret = focused && document.activeElement.selectionStart;

  let html;
  if (r.name === 'project') {
    const spec = core.parseSpec(r.id);
    html = spec ? projectPage(project(spec)) : notFound();
  } else {
    html = ({
      overview: overviewPage, advisories: () => advisoriesModule(true), dependencies: () => dependenciesModule(true),
      verify: () => verifyModule(true), settings: settingsPage, add: addPage, signin: signInPage,
    }[r.name] || notFound)();
  }
  $('#view').innerHTML = html;
  document.title = r.name === 'project' ? `${r.id} · letsgo dashboard` : 'letsgo dashboard';

  if (focused) {
    const el = document.getElementById(focused);
    if (el && el.matches('input[type=text], input[type=search], textarea')) {
      el.focus();
      try { el.setSelectionRange(caret, caret); } catch { /* not a text field */ }
    }
  }
}

function renderAccount() {
  $('#account').innerHTML = USER
    ? `<img class="avatar avatar-sm" src="${esc(USER.avatar_url)}" alt=""><span class="small">${esc(USER.login)}</span><button class="btn btn-sm" data-action="signout">Sign out</button>`
    : token.get()
      ? `<span class="small muted">Signed in with a token</span><button class="btn btn-sm" data-action="signout">Sign out</button>`
      : `<a class="btn btn-sm" href="#/signin">Sign in</a>`;
}

const notFound = () => `<div class="blankslate"><h2>Page not found</h2><p><a href="#/">Back to the overview</a></p></div>`;
const cmd = c => `<div class="cmd"><code>${esc(c)}</code><button class="btn-octicon" data-copy="${esc(c)}" aria-label="Copy">${icons.copy}</button></div>`;
const spinner = '<span class="spinner" aria-label="Loading"></span>';
const ghLink = (path, text) => `<a href="https://github.com/${path}" target="_blank" rel="noopener">${text}</a>`;
const vulnLink = id => `<a href="https://pkg.go.dev/vuln/${encodeURIComponent(id)}" target="_blank" rel="noopener">${esc(id)}</a>`;
const projectHref = p => `#/p/${encodeURIComponent(p.id)}`;
const projectName = p => `${esc(p.owner)}/<b>${esc(p.repo)}</b>${p.prefix ? ` <span class="Label">${esc(p.prefix)}</span>` : ''}`;

function statusOf(p, r) {
  const s = core.status(r);
  if (s.label === 'Vulnerable') return state('danger', `Vulnerable (${s.ids.join(', ')})`);
  if (s.label === 'No known issues') return state('success', `No known issues · ${s.at}`);
  return state(s.kind, s.label);
}

// ---------- overview

function overviewPage() {
  const specs = watched();
  if (!specs.length) {
    return `<div class="Box"><div class="blankslate">
      <h2>Watch your first project</h2>
      <p>Add any repository that releases with letsgo. You'll see which version to use, whether yours needs an update, and what each release recorded.</p>
      <form class="input-group" data-form="add"><input class="form-control mono" id="add-spec" type="text" placeholder="owner/repo" aria-label="Repository" autocomplete="off"><button class="btn btn-primary" type="submit">Watch</button></form>
      <p class="small">Or <button class="btn btn-sm" data-action="add-example">watch danielriddell21/letsgo</button> · <a href="#/add">browse an owner's repositories</a></p>
    </div></div>`;
  }
  for (const s of specs) {
    const p = project(s);
    if (p.status === 'ready') {
      ensureAudits(p);
      ensure(p, core.latestStable(p.releases), 'manifest');
      ensure(p, have(p), 'manifest');
    }
  }
  const s = settings.get();
  return s.overview.filter(m => m.on).map(m => ({
    attention: attentionModule, projects: projectsModule, recent: recentModule,
    advisories: () => advisoriesModule(false), dependencies: () => dependenciesModule(false), verify: () => verifyModule(false),
  }[m.id]())).join('') || `<div class="blankslate"><h2>Nothing to show</h2><p>Every overview module is turned off. <a href="#/settings">Choose modules</a></p></div>`;
}

function attentionModule() {
  const items = [];
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status !== 'ready') continue;
    const v = core.verdict(p.releases, have(p));
    if (v.kind === 'danger') items.push(`<div class="flash danger">${icons.alert}<div class="flash-grow"><b>${esc(p.id)}</b>: ${esc(v.title)}. ${esc(v.text)}</div>${v.target ? `<a class="btn btn-sm" href="${projectHref(p)}" data-select="${esc(v.target.tag)}" data-project="${esc(p.id)}">View ${esc(v.target.tag)}</a>` : ''}</div>`);
  }
  return items.join('');
}

function projectsModule() {
  const rows = watched().map(spec => {
    const p = project(spec);
    const name = `<a href="${projectHref(p)}" class="row">${p.meta && p.meta.avatar ? `<img class="avatar avatar-sm" src="${esc(p.meta.avatar)}" alt="">` : ''}<span>${projectName(p)}</span></a>${p.meta && p.meta.private ? ' <span class="Label">Private</span>' : ''}`;
    if (p.status === 'error') return `<tr><td>${name}</td><td colspan="3"><span class="state danger">${icons.alert}${esc(p.error)}</span> <button class="btn btn-sm" data-action="retry" data-project="${esc(p.id)}">Retry</button></td></tr>`;
    if (p.status !== 'ready') return `<tr><td>${name}</td><td colspan="3">${spinner}</td></tr>`;
    const latest = core.latestStable(p.releases);
    if (!latest) return `<tr><td>${name}</td><td colspan="3" class="muted">No stable releases made with letsgo${p.other ? ` (${p.other} other release${p.other > 1 ? 's' : ''})` : ''}.</td></tr>`;
    const mine = have(p), v = core.verdict(p.releases, mine);
    const status = mine ? (v.kind === 'success' ? state('success', 'Up to date') : v.kind === 'attention' ? state('attention', v.title) : state('danger', v.title)) : statusOf(p, latest);
    return `<tr><td>${name}</td><td>${haveSelect(p)}</td><td class="nowrap"><a class="mono" href="${projectHref(p)}" data-select="${esc(latest.tag)}" data-project="${esc(p.id)}">${esc(latest.tag)}</a><div class="small muted">${core.shortDate(latest.published)}</div></td><td>${status}</td></tr>`;
  }).join('');
  return `<div class="Box">
    <div class="Box-header"><span class="Box-title">Projects <span class="Counter">${watched().length}</span></span><a class="btn btn-sm" href="#/add">${icons.plus}Add project</a></div>
    <div class="Box-scroll"><table class="Table"><thead><tr><th>Project</th><th>You use</th><th>Latest</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

function haveSelect(p, id) {
  const mine = settings.get().have[p.id] || '';
  const opts = p.releases.filter(r => !r.prerelease || r.tag === mine).map(r => `<option value="${esc(r.tag)}" ${r.tag === mine ? 'selected' : ''}>${esc(r.tag)}${r.retracted ? ' (retracted)' : ''}</option>`).join('');
  return `<select class="form-select" ${id ? `id="${id}"` : ''} data-have="${esc(p.id)}" aria-label="Version you use"><option value="">Not installed</option>${opts}</select>`;
}

function recentModule() {
  const all = [];
  for (const spec of watched()) { const p = project(spec); for (const r of p.releases.slice(0, 10)) all.push([p, r]); }
  all.sort((a, b) => String(b[1].published).localeCompare(String(a[1].published)));
  const rows = all.slice(0, 8).map(([p, r]) => `<div class="Box-row"><div class="Box-row-grow"><a class="mono" href="${projectHref(p)}" data-select="${esc(r.tag)}" data-project="${esc(p.id)}">${esc(r.tag)}</a> <span class="muted">${esc(p.id)}</span></div><span class="small muted">${core.shortDate(r.published)}</span>${statusOf(p, r)}</div>`).join('');
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Recent releases</span></div>${rows || '<div class="Box-row muted">No releases yet.</div>'}</div>`;
}

// advisoriesModule lists known vulnerabilities in the version each viewer
// uses and in each project's latest release.
function advisoriesModule(full) {
  const rows = [];
  let loading = false;
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status === 'loading' || p.status === 'idle') { loading = true; continue; }
    ensureAudits(p);
    const targets = full ? p.releases : [have(p), core.latestStable(p.releases)].filter(Boolean);
    for (const r of new Set(targets)) {
      if (r.audit === undefined) { loading = true; continue; }
      const a = core.lastAudit(r);
      if (!a || a.status !== 'affected') continue;
      for (const f of a.findings || []) {
        const fx = core.fixedIn(p.releases, r, f);
        rows.push(`<tr><td>${vulnLink(f.id)}</td><td><a href="${projectHref(p)}" data-select="${esc(r.tag)}" data-project="${esc(p.id)}">${esc(p.id)} <span class="mono">${esc(r.tag)}</span></a>${settings.get().have[p.id] === r.tag ? ' <span class="Label Label--accent">You use</span>' : ''}</td><td><code>${esc(f.module)}</code>${f.fixed ? ` <span class="muted small">fixed in ${esc(f.fixed)}</span>` : ''}</td><td class="mono">${fx ? esc(fx.tag) : '<span class="muted">none yet</span>'}</td><td class="nowrap small muted">${core.shortDate(a.at)}</td></tr>`);
      }
    }
  }
  const body = rows.length
    ? `<div class="Box-scroll"><table class="Table"><thead><tr><th>Advisory</th><th>Release</th><th>Module</th><th>Fixed in</th><th>Audited</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<div class="Box-body muted">${loading ? spinner + ' Checking audits…' : full ? 'No release on this page has a known vulnerability.' : 'Neither the versions you use nor the latest releases have a known vulnerability.'}</div>`;
  const box = `<div class="Box"><div class="Box-header"><span class="Box-title">Advisories${rows.length ? ` <span class="Counter">${rows.length}</span>` : ''}</span>${full ? '' : '<a class="small" href="#/advisories">All releases</a>'}</div>${body}</div>`;
  return full ? `<div class="Subhead"><h1 class="Subhead-heading">Advisories</h1></div><p class="muted">From each release's latest audit (<code>audit.json</code>), written by <code>letsgo audit</code>.</p>${box}` : box;
}

function dependenciesModule(full) {
  const q = ui.dep.trim();
  const rows = [];
  let loading = false;
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status !== 'ready') { loading = loading || p.status === 'loading'; continue; }
    for (const r of new Set([have(p), core.latestStable(p.releases)].filter(Boolean))) {
      ensure(p, r, 'manifest');
      if (r.manifest === undefined) { loading = true; continue; }
      if (!q || !r.manifest) continue;
      for (const m of (r.manifest.modules && r.manifest.modules.list) || []) {
        if (m.path.includes(q)) rows.push(`<tr><td><a href="${projectHref(p)}" data-select="${esc(r.tag)}" data-project="${esc(p.id)}">${esc(p.id)} <span class="mono">${esc(r.tag)}</span></a>${settings.get().have[p.id] === r.tag ? ' <span class="Label Label--accent">You use</span>' : ''}</td><td><code>${esc(m.path)}</code></td><td><code>${esc(m.version)}</code></td></tr>`);
      }
    }
  }
  const box = `<div class="Box"><div class="Box-header"><span class="Box-title">Who uses a module?</span></div>
    <div class="Box-body stack"><input class="form-control mono" id="dep-search" type="search" value="${esc(q)}" placeholder="Module path, e.g. golang.org/x/net" aria-label="Module path" data-input="dep"></div>
    ${rows.length ? `<div class="Box-scroll"><table class="Table"><thead><tr><th>Release</th><th>Module</th><th>Version</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="Box-footer small muted">${loading ? spinner + ' Reading manifests…' : q ? 'No version you use, and no latest release, depends on a matching module.' : 'Type part of a module path.'}</div>`}
  </div>`;
  return full ? `<div class="Subhead"><h1 class="Subhead-heading">Dependencies</h1></div><p class="muted">Searches the dependency list each release's manifest records, in the version you use and the latest. Useful when an advisory lands before any audit has run.</p>${box}` : box;
}

// ---------- verify a file

function verifyModule(full) {
  const box = `<div class="Box"><div class="Box-header"><span class="Box-title">Verify a file</span></div>
    <div class="Box-body stack">
      <div class="drop" id="drop" tabindex="0" role="button" data-action="pick-file"><b>Drop a downloaded file here, or click to choose</b><span class="small muted">An archive, executable, source archive or container digest. It's hashed in your browser; nothing is uploaded.</span></div>
      <form class="input-group" data-form="hash"><input class="form-control mono" id="hash-in" type="text" placeholder="Or paste a SHA-256" aria-label="SHA-256" autocomplete="off"><button class="btn" type="submit">Verify</button></form>
      ${verifyResult()}
    </div></div>`;
  return full ? `<div class="narrow"><div class="Subhead"><h1 class="Subhead-heading">Verify a file</h1></div><p class="muted">Check that a file you downloaded is one a watched project published, and whether that release is still safe to use.</p>${box}</div>` : box;
}

function verifyResult() {
  const c = ui.check;
  if (!c) return '';
  if (c.busy) return `<div class="flash accent">${spinner}<span>${esc(c.busy)}</span></div>`;
  if (c.error) return `<div class="flash attention">${icons.alert}<span>${esc(c.error)}</span></div>`;
  const found = findDigest(c.hash);
  if (found === 'loading') return `<div class="flash accent">${spinner}<span>Reading every release's manifest…</span></div>`;
  if (!found) return `<div class="flash danger">${icons.alert}<div class="flash-grow"><b>Not recognised.</b> ${c.name ? esc(c.name) + ' does' : 'This hash does'} not match any release of a watched project. Don't run it.<div class="hash">${esc(c.hash)}</div></div></div>`;
  const { p, r, d } = found, s = core.status(r);
  return `<div class="flash ${s.kind === 'danger' ? 'attention' : 'success'}">${s.kind === 'danger' ? icons.alert : icons.check}<div class="flash-grow"><b>Published by ${esc(p.id)} in ${esc(r.tag)}</b><div>${esc(d.what)}: <code>${esc(d.file)}</code></div><div>${statusOf(p, r)}</div><div class="hash">${esc(c.hash)}</div></div><a class="btn btn-sm" href="${projectHref(p)}" data-select="${esc(r.tag)}" data-project="${esc(p.id)}">View release</a></div>`;
}

// findDigest looks a SHA-256 up in every manifest of every watched project,
// loading what isn't loaded yet.
function findDigest(hash) {
  let loading = false;
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status === 'loading' || p.status === 'idle') { loading = true; continue; }
    for (const r of p.releases) {
      if (r.manifest === undefined) { ensure(p, r, 'manifest'); loading = true; continue; }
      if (r.manifest && r.sha256 === hash) return { p, r, d: { what: 'manifest', file: 'letsgo.json' } };
      const d = r.manifest && core.digests(r.manifest).find(x => x.sha256 === hash);
      if (d) return { p, r, d };
    }
  }
  return loading ? 'loading' : null;
}

async function hashFile(f) {
  ui.check = { busy: `Hashing ${f.name}…` };
  schedule();
  try {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()));
    ui.check = { hash: core.hex(sum), name: f.name };
  } catch {
    ui.check = { error: "The file couldn't be read. Paste its SHA-256 instead: shasum -a 256 <file>" };
  }
  schedule();
}
function checkHash(h) {
  h = h.trim().toLowerCase().replace(/^sha256:/, '');
  ui.check = /^[0-9a-f]{64}$/.test(h) ? { hash: h } : { error: 'A SHA-256 is 64 hexadecimal characters. Get one with: shasum -a 256 <file>' };
  schedule();
}

// ---------- project page

function projectPage(p) {
  const head = `<div class="row">${p.meta && p.meta.avatar ? `<img class="avatar avatar-md" src="${esc(p.meta.avatar)}" alt="">` : ''}<h1>${ghLink(`${encodeURIComponent(p.owner)}`, esc(p.owner))} / ${ghLink(`${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}`, `<b>${esc(p.repo)}</b>`)}</h1>${p.prefix ? `<span class="Label">${esc(p.prefix)}</span>` : ''}${p.meta && p.meta.private ? `<span class="Label">${icons.lock} Private</span>` : ''}
    <span class="grow"></span>${watched().some(s => s.id === p.id) ? `<button class="btn btn-sm" data-action="unwatch" data-project="${esc(p.id)}">Stop watching</button>` : `<button class="btn btn-sm btn-primary" data-action="watch" data-project="${esc(p.id)}">Watch</button>`}</div>
    ${p.meta && p.meta.description ? `<p class="muted">${esc(p.meta.description)}</p>` : ''}`;
  if (p.status === 'error') return `${head}<div class="flash danger">${icons.alert}<span class="flash-grow">${esc(p.error)}</span><button class="btn btn-sm" data-action="retry" data-project="${esc(p.id)}">Retry</button></div>`;
  if (p.status !== 'ready') return `${head}<p>${spinner} Loading releases…</p>`;
  if (!p.releases.length) return `${head}<div class="Box"><div class="blankslate"><h2>No releases made with letsgo</h2><p>None of this ${p.prefix ? 'module' : 'repository'}'s releases has a <code>letsgo.json</code>${p.other ? `, out of ${p.other} release${p.other > 1 ? 's' : ''} in scope` : ''}.</p></div></div>`;

  const mine = have(p), v = core.verdict(p.releases, mine);
  const sel = p.byTag[ui.sel[p.id]] || v.target || p.releases[0];
  ensureAudits(p);
  for (const r of [sel, mine, v.target]) ensure(p, r, 'manifest');
  if (sel.manifest && sel.manifest.promoted_from) ensure(p, p.byTag[sel.manifest.promoted_from.tag], 'manifest');
  if (mine && v.target && core.compareVersions(v.target.version, mine.version) > 0) {
    for (const r of p.releases) if (!r.prerelease && core.compareVersions(r.version, mine.version) > 0 && core.compareVersions(r.version, v.target.version) <= 0) ensure(p, r, 'manifest');
  }

  const flash = mine && (v.kind === 'danger' || v.kind === 'attention')
    ? `<div class="flash ${v.kind}">${v.kind === 'danger' ? icons.alert : icons.up}<div class="flash-grow"><b>${esc(v.title)}</b>${v.text ? ` ${esc(v.text)}` : ''}</div>${v.target && v.target !== sel ? `<button class="btn btn-sm" data-select="${esc(v.target.tag)}" data-project="${esc(p.id)}">View ${esc(v.target.tag)}</button>` : ''}</div>` : '';
  const verOpts = p.releases.filter(r => ui.allVersions || settings.get().prereleases || !r.prerelease || r === sel).map(r => `<option value="${esc(r.tag)}" ${r === sel ? 'selected' : ''}>${esc(r.tag)}${r === core.latestStable(p.releases) ? ' (latest)' : r.retracted ? ' (retracted)' : r.prerelease ? ' (pre-release)' : ''}</option>`).join('');
  const toolbar = `<div class="row"><label class="row"><span class="muted">Version</span><select class="form-select" id="ver" data-version="${esc(p.id)}">${verOpts}</select></label>${statusOf(p, sel)}<span class="grow"></span><label class="row small"><span class="muted">You use</span>${haveSelect(p, 'have-p')}</label></div>`;

  const sections = settings.get().sections.filter(s => s.on);
  const section = id => ({
    install: () => installSection(p, sel), changes: () => changesSection(p, mine, v.target), provenance: () => provenanceSection(p, sel),
    dependencies: () => depsSection(sel), versions: () => versionsSection(p, sel, mine), details: () => detailsSection(p, sel),
    plugins: () => pluginsSection(sel), fingerprint: () => fingerprintSection(p, sel),
  }[id]());
  const side = new Set(PROJECT_SECTIONS.filter(s => s.side).map(s => s.id));
  const main = sections.filter(s => !side.has(s.id)).map(s => section(s.id)).join('');
  const aside = sections.filter(s => side.has(s.id)).map(s => section(s.id)).join('');
  return `${head}${flash}<div class="layout"><div class="layout-main">${toolbar}${main}</div><aside class="layout-side">${aside}</aside></div>`;
}

function installSection(p, r) {
  if (r.manifest === undefined) return `<div class="Box"><div class="Box-body">${spinner}</div></div>`;
  if (!r.manifest) return `<div class="flash attention">${icons.alert}<span>This release's manifest couldn't be read: ${esc(r.manifestError || '')}</span></div>`;
  const priv = p.meta && p.meta.private;
  const tabs = [['download', 'Download']];
  if ('install.sh' in r.assets && !priv) tabs.push(['script', 'Install script']);
  tabs.push(['go', 'Go']);
  if ((r.manifest.images || []).length) tabs.push(['docker', 'Docker']);
  const tab = tabs.some(t => t[0] === ui.tab) ? ui.tab : 'download';
  const goVer = r.tag.slice(p.prefix.length);
  const module = `github.com/${p.owner}/${p.repo}${r.manifest.module_dir ? '/' + r.manifest.module_dir : ''}`;
  let body = '';
  if (tab === 'download') {
    const plat = platform(), arts = core.artifacts(r.manifest);
    const row = a => `<tr><td class="mono">${esc(a.name)}${a.variant ? ` <span class="Label">${esc(a.variant)}</span>` : ''}${a.binaries.length > 1 ? `<div class="small muted">${a.binaries.map(b => esc(b.name)).join(', ')}</div>` : ''}</td><td class="r nowrap">${core.formatSize(a.size)}</td><td class="nowrap"><code title="${esc(a.sha256)}">${esc(a.sha256.slice(0, 12))}</code><button class="btn-octicon" data-copy="${esc(a.sha256)}" aria-label="Copy SHA-256">${icons.copy}</button></td></tr>`;
    const mine = arts.filter(a => a.platform === plat), rest = arts.filter(a => a.platform !== plat);
    body = `<div class="row"><label class="row small"><span class="muted">Platform</span><select class="form-select" id="plat" data-platform>${PLATFORMS.concat(arts.map(a => a.platform)).filter((x, i, a) => a.indexOf(x) === i).map(x => `<option ${x === plat ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      <div class="Box"><table class="Table"><tbody>${mine.map(row).join('') || `<tr><td class="muted">No ${esc(plat)} build in this release.</td></tr>`}</tbody></table></div>
      ${priv && mine.length ? cmd(`gh release download ${r.tag} -R ${p.owner}/${p.repo} -p ${mine[0].name}`) + '<p class="small muted">Private repository: download with your GitHub sign-in.</p>' : ''}
      ${rest.length ? `<details><summary class="small muted">Other platforms (${rest.length})</summary><div class="Box"><table class="Table"><tbody>${rest.map(row).join('')}</tbody></table></div></details>` : ''}`;
  } else if (tab === 'script') {
    body = `${cmd(`curl -fsSL https://github.com/${p.owner}/${p.repo}/releases/download/${r.tag}/install.sh | sh`)}<p class="small muted">The script checks each file's SHA-256 before installing it.</p>`;
  } else if (tab === 'go') {
    body = priv
      ? `${cmd(`GOPRIVATE=github.com/${p.owner}/* go install ${module}/...@${goVer}`)}<p class="small muted">Private module: Go fetches it with your git credentials and skips the public checksum database.</p>`
      : `${cmd(`go install ${module}/...@${goVer}`)}<p class="small muted">Builds the module's commands from source with your Go toolchain.</p>`;
  } else if (tab === 'docker') {
    body = r.manifest.images.map(i => `${cmd(`docker pull ${i.reference}@${i.digest}`)}<p class="small muted">${(i.platforms || []).map(esc).join(', ')}${i.base ? ` · based on <code>${esc(i.base)}</code>` : ''}${priv ? ' · sign in to the registry first' : ''}</p>`).join('');
  }
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Install ${esc(r.tag)}</span>${r.url ? `<a class="small" href="${esc(r.url)}" target="_blank" rel="noopener">Release page</a>` : ''}</div>
    <div class="Box-body stack"><div class="TabNav" role="tablist">${tabs.map(t => `<button class="TabNav-item" role="tab" data-tab="${t[0]}" aria-selected="${t[0] === tab}">${t[1]}</button>`).join('')}</div>${body}</div></div>`;
}

function changesSection(p, from, to) {
  if (!from || !to || core.compareVersions(to.version, from.version) <= 0) return '';
  if (!from.manifest || !to.manifest) return `<div class="Box"><div class="Box-header"><span class="Box-title">Changes from ${esc(from.tag)} to ${esc(to.tag)}</span></div><div class="Box-body">${spinner}</div></div>`;
  const c = core.changes(p.releases, from, to, platform());
  const items = [];
  const a = core.lastAudit(from);
  for (const f of (a && a.status === 'affected' && a.findings) || []) { const fx = core.fixedIn(p.releases, from, f); if (fx && core.compareVersions(fx.version, to.version) <= 0) items.push(`Fixes ${vulnLink(f.id)}`); }
  for (const x of c.api) items.push(`${x.kind === 'incompatible' ? '<span class="Label Label--danger">Breaking</span> ' : ''}<code>${esc(x.text)}</code> <span class="muted small">${esc(x.tag)}</span>`);
  for (const d of c.deps) items.push(`<code>${esc(d.path)}</code> ${esc(d.from || 'added')} → ${esc(d.to || 'removed')}`);
  if (c.go) items.push(`Go ${esc(c.go.from)} → ${esc(c.go.to)}`);
  if (c.size) items.push(`${esc(platform())} download ${core.formatSize(c.size.from)} → ${core.formatSize(c.size.to)}`);
  for (const r of c.retracted) items.push(`Skips retracted ${esc(r.tag)}`);
  if (c.missing.length) items.push(`<span class="muted">${spinner} reading ${c.missing.length} more manifest${c.missing.length > 1 ? 's' : ''}</span>`);
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Changes from ${esc(from.tag)} to ${esc(to.tag)}</span><span class="small muted">${c.span.length} release${c.span.length === 1 ? '' : 's'}</span></div>
    <div class="Box-body">${items.length ? `<ul class="list">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '<span class="muted">No recorded changes to the API, dependencies or toolchain.</span>'}</div></div>`;
}

function provenanceSection(p, r) {
  if (!r.manifest) return '';
  const m = r.manifest, rows = [];
  const row = (k, v) => rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  const feat = m.features || {}, off = f => (feat.disabled || []).includes(f);
  if (r.retracted) row('Retracted', state('danger', r.retracted.reason || 'Withdrawn by the maintainer') + (r.retracted.use ? ` <span class="muted">Use ${esc(r.retracted.use)} or later.</span>` : ''));
  const a = core.lastAudit(r);
  row('Vulnerability audit', r.audit === undefined ? spinner : !a ? state('secondary', 'Not audited since release')
    : a.status === 'clean' ? state('success', `No known vulnerabilities as of ${core.shortDate(a.at)}`)
      : `${state('danger', 'Affected')} ${(a.findings || []).map(f => `${vulnLink(f.id)} in <code>${esc(f.module)}</code>`).join(', ')}`);
  const vg = core.gate(r, 'vulnerabilities', p.byTag);
  row('Scanned at release', off('vulncheck') ? 'No, turned off by the maintainer' : vg === 'pass' ? state('success', 'Passed') : vg === 'skip' ? state('attention', 'Skipped') : '<span class="muted">Not recorded</span>');
  row('Reproducible build', `Yes. Check it with <code>letsgo verify ${esc(r.tag)}</code>`);
  if (m.source) row('Source archive', `<code>${esc(m.source.archive)}</code>`);
  if (m.promoted_from) {
    const rc = p.byTag[m.promoted_from.tag];
    row('Promoted from', !rc || rc.manifest === undefined ? `<code>${esc(m.promoted_from.tag)}</code> ${spinner}` : rc.sha256 === m.promoted_from.manifest_sha256
      ? `<code>${esc(m.promoted_from.tag)}</code>, ${state('success', 'digest matches')}` : `<code>${esc(m.promoted_from.tag)}</code>, ${state('danger', 'digest does not match')}`);
  }
  if (m.plan) row('Release plan', `Reviewed ${core.shortDate(m.plan.created_at)} with letsgo ${esc(m.plan.letsgo_version)}`);
  const sg = core.gate(r, 'sumdb', p.byTag);
  if (sg || off('sumdb')) row('Go checksum database', off('sumdb') ? 'Not checked' : sg === 'pass' ? state('success', 'Present') : esc(sg));
  const api = m.api_changes || [], inc = api.filter(x => x.kind === 'incompatible');
  if (off('api-gate')) row('API compatibility', '<span class="muted">Not checked</span>');
  else if (api.length) row('API changes', `${inc.length ? `<span class="Label Label--danger">${inc.length} breaking</span> ` : ''}${api.length - inc.length ? `<span class="Label">${api.length - inc.length} added</span>` : ''}<ul class="list small">${api.map(x => `<li><code>${esc(x.text)}</code></li>`).join('')}</ul>`);
  else if (core.gate(r, 'api compatibility', p.byTag) === 'pass') row('API changes', 'None');
  row('SBOM', off('sbom') ? '<span class="muted">Not published</span>' : m.sbom ? `<code>${esc(m.sbom)}</code>` : '<span class="muted">Not published</span>');
  if ((feat.required || []).length) row('Required checks', feat.required.map(esc).join(', '));
  const others = (feat.disabled || []).filter(f => !['vulncheck', 'sbom', 'api-gate', 'sumdb'].includes(f));
  if (others.length) row('Turned off', others.map(esc).join(', '));
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Security and provenance</span></div><table class="Table kv"><tbody>${rows.join('')}</tbody></table></div>`;
}

function depsSection(r) {
  const list = r.manifest && r.manifest.modules && r.manifest.modules.list || [];
  if (!list.length) return '';
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Dependencies <span class="Counter">${list.length}</span></span>${r.manifest.sbom ? `<span class="small muted">Full SBOM: <code>${esc(r.manifest.sbom)}</code></span>` : ''}</div>
    <div class="Box-scroll"><table class="Table"><tbody>${list.map(m => `<tr><td><code>${esc(m.path)}</code></td><td><code>${esc(m.version)}</code></td></tr>`).join('')}</tbody></table></div></div>`;
}

function versionsSection(p, sel, mine) {
  const s = settings.get();
  const list = p.releases.filter(r => ui.allVersions || s.prereleases || !r.prerelease || r === sel || r === mine);
  const shown = ui.allVersions ? list : list.slice(0, 15);
  const rows = shown.map(r => `<tr class="clickable ${r === sel ? 'selected' : ''}" data-select="${esc(r.tag)}" data-project="${esc(p.id)}"><td class="mono">${r.retracted ? `<s>${esc(r.tag)}</s>` : esc(r.tag)}${r === mine ? ' <span class="Label Label--accent">You use</span>' : ''}${r.prerelease ? ' <span class="Label">Pre-release</span>' : ''}</td><td class="nowrap muted">${core.shortDate(r.published)}</td><td>${statusOf(p, r)}</td></tr>`).join('');
  return `<div class="Box"><div class="Box-header"><span class="Box-title">Versions <span class="Counter">${p.releases.length}</span></span><button class="btn btn-sm" data-action="all-versions">${ui.allVersions ? 'Show fewer' : 'Show all, with pre-releases'}</button></div>
    <div class="Box-scroll"><table class="Table"><tbody>${rows}</tbody></table></div>${p.other ? `<div class="Box-footer small muted">${p.other} release${p.other > 1 ? 's' : ''} without a <code>letsgo.json</code> not shown.</div>` : ''}</div>`;
}

function detailsSection(p, r) {
  const m = r.manifest;
  if (!m) return '';
  const plats = [...new Set(core.artifacts(m).map(a => a.platform))];
  return `<div class="side-section"><h3>About ${esc(r.tag)}</h3><table class="Table kv small"><tbody>
    <tr><td>Published</td><td>${core.shortDate(r.published)}</td></tr>
    <tr><td>Commit</td><td>${ghLink(`${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}/commit/${encodeURIComponent(m.commit)}`, `<code>${esc(String(m.commit).slice(0, 7))}</code>`)}</td></tr>
    <tr><td>Go</td><td><code>${esc(String(m.builder.go).replace(/^go/, ''))}</code></td></tr>
    <tr><td>Built by</td><td><code>${esc(m.builder.tool)}</code></td></tr>
    <tr><td>Platforms</td><td>${plats.map(esc).join(', ')}</td></tr>
    ${m.modules && m.modules.count ? `<tr><td>Modules</td><td>${m.modules.count}</td></tr>` : ''}
  </tbody></table></div>`;
}

function pluginsSection(r) {
  const pl = r.manifest && r.manifest.builder.plugins || [];
  if (!pl.length) return '';
  const hook = { ldflags: 'Build-time values', 'archive-layout': 'Archive layout', 'tap-files': 'Homebrew tap files' };
  return `<div class="side-section"><h3>Plugins</h3>${pl.map(x => `<div><code>${esc(x.command)}</code> <span class="small muted">${esc(x.version || '')}</span><div class="small muted">${esc(hook[x.hook] || x.hook)} · <code title="${esc(x.digest)}">${esc(String(x.digest).slice(7, 19))}</code></div></div>`).join('')}</div>`;
}

function fingerprintSection(p, r) {
  if (!r.manifest) return '';
  return `<div class="side-section"><div class="spread"><h3>Fingerprint</h3><span class="SegmentedControl"><button data-fp="art" aria-pressed="${ui.fp === 'art'}">Art</button><button data-fp="words" aria-pressed="${ui.fp === 'words'}">Words</button></span></div>
    ${ui.fp === 'art' ? `<pre class="art">${esc(r.art)}</pre>` : `<div class="words mono">${r.words.map(w => `<span>${esc(w)}</span>`).join('')}</div>`}
    <p class="small muted">The same as <code>letsgo verify</code> prints for this release.</p>
    ${cmd(`letsgo verify ${r.tag} --repo ${p.owner}/${p.repo}`)}</div>`;
}

// ---------- add a project

function addPage() {
  const repos = ui.ownerRepos;
  return `<div class="narrow">
    <div class="Subhead"><h1 class="Subhead-heading">Add a project</h1></div>
    ${ui.notice ? `<div class="flash attention">${icons.alert}<span>${esc(ui.notice)}</span></div>` : ''}
    <form class="stack" data-form="add"><label class="form-label" for="add-spec">Repository</label>
      <div class="input-group"><input class="form-control mono" id="add-spec" type="text" placeholder="owner/repo, or owner/repo@cli/ for a monorepo module" autocomplete="off"><button class="btn btn-primary" type="submit">Watch</button></div></form>
    <form class="stack" data-form="owner"><label class="form-label" for="owner-in">Browse an owner's repositories</label>
      <div class="input-group"><input class="form-control mono" id="owner-in" type="text" value="${esc(ui.addOwner)}" placeholder="owner or organisation" autocomplete="off"><button class="btn" type="submit">List</button></div>
      ${USER ? `<p class="small"><button class="btn btn-sm" type="button" data-action="my-repos">List repositories I can read</button></p>` : ''}</form>
    ${ui.ownerError ? `<div class="flash danger">${icons.alert}<span>${esc(ui.ownerError)}</span></div>` : ''}
    ${repos === 'loading' ? spinner : repos ? `<div class="Box">${repos.map(r => {
      const id = r.full_name, on = watched().some(s => s.id === id);
      return `<div class="Box-row"><div class="Box-row-grow"><b>${esc(id)}</b>${r.private ? ' <span class="Label">Private</span>' : ''}<div class="small muted">${esc(r.description || '')}</div></div>${on ? '<span class="small muted">Watching</span>' : `<button class="btn btn-sm" data-action="watch" data-project="${esc(id)}">Watch</button>`}</div>`;
    }).join('') || '<div class="Box-row muted">No repositories.</div>'}</div>` : ''}
  </div>`;
}

async function listRepos(load) {
  ui.ownerRepos = 'loading';
  ui.ownerError = '';
  schedule();
  try { ui.ownerRepos = (await load()).map(r => ({ full_name: r.full_name, private: r.private, description: r.description })); }
  catch (e) { ui.ownerRepos = null; ui.ownerError = e.status === 404 ? 'No such owner, or your account can\'t see it.' : e.message; }
  schedule();
}

function watch(id) {
  const spec = core.parseSpec(id);
  if (!spec) { ui.notice = 'Enter owner/repo, or owner/repo@prefix/ for one module of a monorepo.'; schedule(); return false; }
  const ids = watched().map(s => s.id);
  if (!ids.includes(spec.id)) setWatched([...ids, spec.id]);
  ui.notice = '';
  return true;
}

// ---------- sign in

function signInPage() {
  return `<div class="narrow">
    <div class="Subhead"><h1 class="Subhead-heading">Sign in</h1></div>
    <p class="muted">Public projects work without signing in. Sign in to see private repositories you have access to, and for a higher GitHub rate limit.</p>
    ${ui.notice ? `<div class="flash danger">${icons.alert}<span>${esc(ui.notice)}</span></div>` : ''}
    ${CONFIG.oauth ? `<div><button class="btn btn-primary" data-action="oauth">Sign in with GitHub</button></div><p class="small muted">— or use a token —</p>` : ''}
    <form class="stack" data-form="token"><label class="form-label" for="token-in">GitHub token</label>
      <div class="input-group"><input class="form-control mono" id="token-in" type="password" autocomplete="off" spellcheck="false" placeholder="Paste a token"><button class="btn" type="submit">Sign in</button></div></form>
    <p class="small muted">With the GitHub CLI, run <code>gh auth token</code> and paste the result. Or <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">create a fine-grained token</a> with read access to Contents and Metadata.</p>
    <p class="small muted">The token is kept in this browser's local storage and sent only to this dashboard's server, which passes it to GitHub and keeps nothing. Sign out removes it.</p>
  </div>`;
}

async function signIn(t) {
  token.set(t);
  try {
    USER = await github.user();
    cache.clear();
    projects.clear();
    ui.notice = '';
    location.hash = '#/';
  } catch (e) {
    token.clear();
    USER = null;
    ui.notice = e.status === 401 ? 'GitHub did not accept that token. It may have expired.' : e.message;
  }
  schedule();
}

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function oauthStart() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const st = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem('lgd:oauth', JSON.stringify({ state: st, verifier }));
  location.assign(`${CONFIG.web}/login/oauth/authorize?` + new URLSearchParams({
    client_id: CONFIG.client_id, redirect_uri: location.origin + '/', state: st, code_challenge: challenge, code_challenge_method: 'S256',
  }));
}
async function oauthReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('lgd:oauth') || 'null'); sessionStorage.removeItem('lgd:oauth'); } catch { /* storage unavailable */ }
  history.replaceState(null, '', location.pathname + '#/signin');
  if (q.has('error')) { ui.notice = 'GitHub sign-in was cancelled.'; return; }
  if (!saved || saved.state !== q.get('state')) { ui.notice = 'Sign-in could not be confirmed. Try again.'; return; }
  try {
    const res = await fetch('/api/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: q.get('code'), code_verifier: saved.verifier, redirect_uri: location.origin + '/' }),
    });
    const j = await res.json();
    if (!res.ok || !j.access_token) throw new Error(j.message || 'no token');
    await signIn(j.access_token);
  } catch (e) { ui.notice = `Sign-in with GitHub did not finish: ${e.message}`; }
}

// ---------- settings

function settingsPage() {
  const s = settings.get();
  const themes = [['auto', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['dark_dimmed', 'Dark dimmed']];
  const modules = (list, known, kind) => `<div class="Box module-list">${list.map((m, i) => {
    const k = known.find(x => x.id === m.id);
    return `<div class="Box-row"><label class="checkbox Box-row-grow"><input type="checkbox" data-toggle="${kind}" data-id="${m.id}" ${m.on ? 'checked' : ''}>${esc(k.title)}${k.side ? ' <span class="small muted">sidebar</span>' : ''}</label>
      <button class="btn-octicon" data-move="${kind}" data-id="${m.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icons.arrowUp}</button><button class="btn-octicon" data-move="${kind}" data-id="${m.id}" data-dir="1" aria-label="Move down" ${i === list.length - 1 ? 'disabled' : ''}>${icons.arrowDown}</button></div>`;
  }).join('')}</div>`;
  const watchedList = watched();
  return `<div class="narrow">
    <div class="Subhead"><h1 class="Subhead-heading">Settings</h1></div>
    <div class="stack"><h2>Theme</h2><div class="SegmentedControl" role="group" aria-label="Theme">${themes.map(([v, l]) => `<button data-set-theme="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}</div></div>
    <div class="stack"><h2>Platform</h2><p class="small muted">Download links and sizes are shown for this platform.</p>
      <select class="form-select" id="plat-setting" data-platform><option value="">Detect (${esc(platform())})</option>${PLATFORMS.map(x => `<option ${s.platform === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label class="checkbox"><input type="checkbox" data-pref="prereleases" ${s.prereleases ? 'checked' : ''}> Show pre-releases in version lists</label></div>
    <div class="stack"><h2>Overview</h2><p class="small muted">Choose the modules on the overview, and their order.</p>${modules(s.overview, OVERVIEW_MODULES, 'overview')}</div>
    <div class="stack"><h2>Project page</h2>${modules(s.sections, PROJECT_SECTIONS, 'sections')}</div>
    <div class="stack"><h2>Watched projects</h2>
      <div class="Box">${watchedList.map(sp => `<div class="Box-row"><a class="Box-row-grow mono" href="${projectHref(sp)}">${esc(sp.id)}</a><button class="btn btn-sm" data-action="unwatch" data-project="${esc(sp.id)}">Remove</button></div>`).join('') || '<div class="Box-row muted">None yet.</div>'}</div>
      <div><a class="btn btn-sm" href="#/add">${icons.plus}Add project</a></div></div>
    <div class="stack"><h2>Share your setup</h2><p class="small muted">Your watched projects and layout, without your token. Paste it into another browser to set it up the same way.</p>
      <textarea class="form-control mono" id="settings-json" rows="6" aria-label="Settings">${esc(settings.export())}</textarea>
      <div class="row"><button class="btn btn-sm" data-copy-from="settings-json">Copy</button><button class="btn btn-sm" data-action="import">Import what's in the box</button></div>
      ${ui.notice ? `<div class="flash attention">${icons.alert}<span>${esc(ui.notice)}</span></div>` : ''}</div>
    <div class="stack"><h2>Stored in this browser</h2><p class="small muted">The dashboard keeps nothing on its server. In this browser it keeps your settings${token.get() ? ', your token' : ''} and ${Math.round(cache.size() / 1024)} KB of cached GitHub responses.</p>
      <div class="row"><button class="btn btn-sm" data-action="clear-cache">Clear cache</button><button class="btn btn-sm btn-danger" data-action="forget">Remove everything</button></div></div>
  </div>`;
}

function move(kind, id, dir) {
  const s = settings.get(), list = s[kind], i = list.findIndex(m => m.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  settings.set({ [kind]: list });
}

// ---------- events

function copy(text, button) {
  const done = () => { button.classList.add('copied'); button.setAttribute('aria-label', 'Copied'); setTimeout(() => button.setAttribute('aria-label', 'Copy'), 1200); };
  navigator.clipboard.writeText(text).then(done, () => {});
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('button, a, [data-select], [data-action]');
  if (!t) return;
  if (t.dataset.copy !== undefined) { copy(t.dataset.copy, t); return; }
  if (t.dataset.copyFrom) { copy(document.getElementById(t.dataset.copyFrom).value, t); return; }
  if (t.dataset.select) {
    ui.sel[t.dataset.project] = t.dataset.select;
    if (route().name !== 'project') { location.hash = `#/p/${encodeURIComponent(t.dataset.project)}`; ev.preventDefault(); }
    schedule();
    return;
  }
  if (t.dataset.tab) { ui.tab = t.dataset.tab; schedule(); return; }
  if (t.dataset.fp) { ui.fp = t.dataset.fp; schedule(); return; }
  if (t.dataset.setTheme) { settings.set({ theme: t.dataset.setTheme }); schedule(); return; }
  if (t.dataset.move) { move(t.dataset.move, t.dataset.id, +t.dataset.dir); schedule(); return; }
  const a = t.dataset.action;
  if (!a) return;
  ev.preventDefault();
  const p = t.dataset.project;
  if (a === 'retry') { const pr = projects.get(p); if (pr) loadProject(pr, true); }
  else if (a === 'watch') { watch(p); schedule(); }
  else if (a === 'unwatch') { setWatched(watched().map(s => s.id).filter(id => id !== p)); schedule(); }
  else if (a === 'add-example') { watch('danielriddell21/letsgo'); schedule(); }
  else if (a === 'all-versions') { ui.allVersions = !ui.allVersions; schedule(); }
  else if (a === 'pick-file') $('#file').click();
  else if (a === 'my-repos') listRepos(github.myRepos);
  else if (a === 'oauth') oauthStart();
  else if (a === 'signout') { token.clear(); cache.clear(); projects.clear(); USER = null; location.hash = '#/'; schedule(); }
  else if (a === 'clear-cache') { cache.clear(); schedule(); }
  else if (a === 'forget') { forgetEverything(); USER = null; projects.clear(); location.hash = '#/'; schedule(); }
  else if (a === 'import') {
    try { settings.import($('#settings-json').value); ui.notice = ''; projects.clear(); } catch (e) { ui.notice = `That isn't valid settings JSON: ${e.message}`; }
    schedule();
  }
});

document.addEventListener('submit', ev => {
  const f = ev.target.dataset.form;
  if (!f) return;
  ev.preventDefault();
  if (f === 'add') { if (watch($('#add-spec').value)) location.hash = '#/'; schedule(); }
  else if (f === 'owner') { const o = $('#owner-in').value.trim(); ui.addOwner = o; if (/^[A-Za-z0-9_.-]+$/.test(o)) listRepos(() => github.ownerRepos(o)); }
  else if (f === 'token') { const v = $('#token-in').value.trim(); if (v) signIn(v); }
  else if (f === 'hash') checkHash($('#hash-in').value);
});

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.have !== undefined) {
    const s = settings.get();
    if (t.value) s.have[t.dataset.have] = t.value; else delete s.have[t.dataset.have];
    settings.set({ have: s.have });
  } else if (t.dataset.version) ui.sel[t.dataset.version] = t.value;
  else if (t.dataset.platform !== undefined) settings.set({ platform: t.value });
  else if (t.dataset.toggle) { const s = settings.get(); const m = s[t.dataset.toggle].find(x => x.id === t.dataset.id); m.on = t.checked; settings.set({ [t.dataset.toggle]: s[t.dataset.toggle] }); }
  else if (t.dataset.pref) settings.set({ [t.dataset.pref]: t.checked });
  else if (t.id === 'file' && t.files[0]) { hashFile(t.files[0]); t.value = ''; return; }
  else return;
  schedule();
});

document.addEventListener('input', ev => { if (ev.target.dataset.input === 'dep') { ui.dep = ev.target.value; schedule(); } });
document.addEventListener('keydown', ev => { if (ev.target.id === 'drop' && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); $('#file').click(); } });
document.addEventListener('dragover', ev => { const d = ev.target.closest && ev.target.closest('#drop'); if (d) { ev.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', ev => { const d = ev.target.closest && ev.target.closest('#drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', ev => {
  const d = ev.target.closest && ev.target.closest('#drop');
  if (!d) return;
  ev.preventDefault();
  if (ev.dataTransfer.files[0]) hashFile(ev.dataTransfer.files[0]);
});
window.addEventListener('hashchange', () => { ui.notice = ''; schedule(); window.scrollTo(0, 0); });

// ---------- boot

(async () => {
  applyTheme();
  try { CONFIG = { ...CONFIG, ...(await (await fetch('/api/config')).json()) }; } catch { /* defaults */ }
  await oauthReturn();
  if (token.get() && !USER) {
    try { USER = await github.user(); } catch (e) { if (e.status === 401) { token.clear(); ui.notice = 'Your sign-in expired. Sign in again.'; } }
  }
  render();
})();
