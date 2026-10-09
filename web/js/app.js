// The dashboard: routing, rendering and events. What the viewer sets up is
// kept in localStorage (see store.js); the server keeps nothing.

import * as core from './core.js';
import { h, mount } from './dom.js';
import { settings, token, forgetEverything } from './store.js';
import { github, forget, useStaticData } from './github.js';
import { session, ui, isStatic, onRender, schedule } from './state.js';
import { watched, setWatched, project, findProject, loadProject, forgetProjects } from './projects.js';
import { external } from './ui.js';
import { overviewPage, advisoriesModule, dependenciesModule } from './views/overview.js';
import { projectPage } from './views/project.js';
import { verifyModule, hashFile, checkHash } from './views/verify.js';
import { addPage, signInPage, settingsPage, notFound } from './views/pages.js';

const $ = sel => document.querySelector(sel);

// ---------- theme

function applyTheme() {
  const t = settings.get().theme;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  let theme = t;
  if (t === 'auto') theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------- rendering

function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (hash.startsWith('p/')) return { name: 'project', id: hash.slice(2) };
  return { name: hash || 'overview' };
}

const PAGES = {
  overview: overviewPage,
  advisories: () => advisoriesModule(true),
  dependencies: () => dependenciesModule(true),
  verify: () => verifyModule(true),
  settings: settingsPage,
  add: addPage,
  signin: signInPage,
};

function viewFor(r) {
  if (r.name !== 'project') return (PAGES[r.name] || notFound)();
  const spec = core.parseSpec(r.id);
  return spec ? projectPage(project(spec)) : notFound();
}

function renderAccount() {
  const account = $('#account');
  if (isStatic()) {
    mount(account, h('span', { class: 'Label' }, 'Public projects'));
  } else if (session.user) {
    mount(account,
      h('img', { class: 'avatar avatar-sm', src: session.user.avatar_url, alt: '' }),
      h('span', { class: 'small' }, session.user.login),
      h('button', { class: 'btn btn-sm', 'data-action': 'signout' }, 'Sign out'));
  } else if (token.get()) {
    mount(account, h('span', { class: 'small muted' }, 'Signed in with a token'), h('button', { class: 'btn btn-sm', 'data-action': 'signout' }, 'Sign out'));
  } else {
    mount(account, h('a', { class: 'btn btn-sm', href: '#/signin' }, 'Sign in'));
  }
}

function renderFooter() {
  const kept = isStatic()
    ? `Release data as of ${core.shortDate(session.config.generated)}. Your settings are kept in this browser only.`
    : 'Your settings and token are kept in this browser only.';
  mount($('#footer'),
    h('span', {}, `letsgo dashboard ${session.config.version}`),
    h('span', {}, kept),
    h('a', { href: '#/settings' }, 'Settings'),
    external('https://github.com/danielriddell21/letsgo-dashboard', 'Run your own'));
}

// Releases arrive while someone is typing, and each one re-renders the page.
// The fields below keep what was typed, and focus and the cursor stay put.
const TYPED = ['hash-in', 'owner-in', 'token-in'];

function captureInputs() {
  const el = document.activeElement;
  return {
    focus: el?.id ? { id: el.id, caret: el.selectionStart } : null,
    typed: TYPED.map(id => [id, document.getElementById(id)?.value]).filter(([, v]) => v),
  };
}
function restoreInputs({ focus, typed }) {
  for (const [id, value] of typed) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = value;
  }
  const el = focus && document.getElementById(focus.id);
  if (!el?.matches('input[type=text], input[type=search], input[type=password], textarea')) return;
  el.focus();
  try {
    el.setSelectionRange(focus.caret, focus.caret);
  } catch {
    // Not a text field.
  }
}

function render() {
  applyTheme();
  const r = route();
  const current = r.name === 'overview' ? '' : r.name;
  for (const a of document.querySelectorAll('#nav a')) a.setAttribute('aria-current', a.dataset.route === current ? 'page' : 'false');
  renderAccount();
  renderFooter();
  const inputs = captureInputs();
  mount($('#view'), viewFor(r));
  document.title = r.name === 'project' ? `${r.id} · letsgo dashboard` : 'letsgo dashboard';
  restoreInputs(inputs);
}
onRender(render);

// ---------- actions

function watch(id) {
  const spec = core.parseSpec(id);
  if (!spec) {
    ui.notice = 'Enter owner/repo, or owner/repo@prefix/ for one module of a monorepo.';
    return false;
  }
  const ids = watched().map(s => s.id);
  if (!ids.includes(spec.id)) setWatched([...ids, spec.id]);
  ui.notice = '';
  return true;
}

// ---------- search

let searchTimer = 0;
const SEARCH_DELAY = 400;

// runSearch looks up what is typed, unless it is already an exact name (which
// is offered as it stands) or too short to mean anything. An answer that
// arrives after the text has changed is dropped.
async function runSearch() {
  clearTimeout(searchTimer);
  const s = ui.search, q = s.q.trim();
  if (q.length < 2 || core.parseSpec(q)) {
    Object.assign(s, { status: 'idle', results: [], error: '' });
    schedule();
    return;
  }
  Object.assign(s, { status: 'loading', error: '' });
  schedule();
  try {
    const found = await github.search(q);
    if (s.q.trim() === q) Object.assign(s, { status: 'done', results: found });
  } catch (e) {
    if (s.q.trim() === q) Object.assign(s, { status: 'error', results: [], error: e.message });
  }
  schedule();
}

function queueSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch().catch(console.error), SEARCH_DELAY);
}

async function listRepos(load) {
  ui.ownerRepos = 'loading';
  ui.ownerError = '';
  schedule();
  try {
    ui.ownerRepos = (await load()).map(r => ({ full_name: r.full_name, private: r.private, description: r.description }));
  } catch (e) {
    ui.ownerRepos = null;
    ui.ownerError = e.status === 404 ? "No such owner, or your account can't see it." : e.message;
  }
  schedule();
}

function resetData() {
  forget();
  forgetProjects();
}

async function signIn(t) {
  try {
    token.set(t);
    session.user = await github.user();
    resetData();
    ui.notice = '';
    location.hash = '#/';
  } catch (e) {
    token.clear();
    session.user = null;
    ui.notice = e.status === 401 ? 'GitHub did not accept that token. It may have expired.' : e.message;
  }
  schedule();
}

function signOut() {
  token.clear();
  session.user = null;
  resetData();
  location.hash = '#/';
}

function trimPadding(s) {
  let out = s;
  while (out.endsWith('=')) out = out.slice(0, -1);
  return out;
}
const b64url = bytes => trimPadding(btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_'));
const redirectURI = () => location.origin + location.pathname;

async function oauthStart() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem('lgd:oauth', JSON.stringify({ state, verifier }));
  const query = new URLSearchParams({ client_id: session.config.client_id, redirect_uri: redirectURI(), state, code_challenge: challenge, code_challenge_method: 'S256' });
  location.assign(`${session.config.web}/login/oauth/authorize?${query}`);
}

function takeSavedOAuth() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('lgd:oauth') || 'null');
    sessionStorage.removeItem('lgd:oauth');
    return saved;
  } catch {
    return null;
  }
}

async function exchange(code, verifier) {
  const res = await fetch('api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectURI() }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(j.message || 'no token');
  return j.access_token;
}

async function oauthReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  const saved = takeSavedOAuth();
  history.replaceState(null, '', location.pathname + '#/signin');
  if (q.has('error')) {
    ui.notice = 'GitHub sign-in was cancelled.';
  } else if (saved?.state === q.get('state')) {
    try {
      await signIn(await exchange(q.get('code'), saved.verifier));
    } catch (e) {
      ui.notice = `Sign-in with GitHub did not finish: ${e.message}`;
    }
  } else {
    ui.notice = 'Sign-in could not be confirmed. Try again.';
  }
}

function move(kind, id, dir) {
  const list = settings.get()[kind];
  const i = list.findIndex(m => m.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  settings.set({ [kind]: list });
}

function importSettings() {
  try {
    settings.import($('#settings-json').value);
    ui.notice = '';
    ui.draft = null;
    forgetProjects();
  } catch (e) {
    ui.notice = `That isn't valid settings JSON: ${e.message}`;
  }
}

const ACTIONS = {
  retry: t => {
    const p = findProject(t.dataset.project);
    if (p) loadProject(p, true).catch(console.error);
  },
  watch: t => watch(t.dataset.project),
  unwatch: t => setWatched(watched().map(s => s.id).filter(id => id !== t.dataset.project)),
  'add-example': () => watch('danielriddell21/letsgo'),
  'all-versions': () => { ui.allVersions = !ui.allVersions; },
  'pick-file': () => $('#file').click(),
  'my-repos': () => listRepos(github.myRepos).catch(console.error),
  oauth: () => oauthStart().catch(console.error),
  signout: signOut,
  forget: () => {
    forgetEverything();
    session.user = null;
    resetData();
    location.hash = '#/';
  },
  import: importSettings,
};

// ---------- events

function copy(text, button) {
  navigator.clipboard.writeText(text).then(() => button.setAttribute('aria-label', 'Copied'), () => {});
}

function select(t, ev) {
  ui.sel[t.dataset.project] = t.dataset.select;
  if (route().name !== 'project') {
    ev.preventDefault();
    location.hash = `#/p/${encodeURIComponent(t.dataset.project)}`;
  }
}

// Each clickable carries one data attribute naming what it does; the first
// one found decides.
const CLICKS = [
  ['copy', t => copy(t.dataset.copy, t)],
  ['copyFrom', t => copy($(`#${t.dataset.copyFrom}`).value, t)],
  ['select', select],
  ['tab', t => { ui.tab = t.dataset.tab; }],
  ['fp', t => { ui.fp = t.dataset.fp; }],
  ['setTheme', t => settings.set({ theme: t.dataset.setTheme })],
  ['move', t => move(t.dataset.move, t.dataset.id, Number(t.dataset.dir))],
  ['action', (t, ev) => {
    ev.preventDefault();
    ACTIONS[t.dataset.action]?.(t);
  }],
];

document.addEventListener('click', ev => {
  const t = ev.target.closest('button, a, [data-select], [data-action]');
  if (!t) return;
  const handler = CLICKS.find(([key]) => t.dataset[key] !== undefined);
  if (!handler) return;
  handler[1](t, ev);
  schedule();
});

const SUBMITS = {
  search: () => runSearch().catch(console.error),
  owner: () => {
    const owner = $('#owner-in').value.trim();
    ui.addOwner = owner;
    if (/^[\w.-]+$/.test(owner)) listRepos(() => github.ownerRepos(owner)).catch(console.error);
  },
  token: () => {
    const value = $('#token-in').value.trim();
    if (value) signIn(value).catch(console.error);
  },
  hash: () => checkHash($('#hash-in').value),
};

document.addEventListener('submit', ev => {
  const handler = SUBMITS[ev.target.dataset.form];
  if (!handler) return;
  ev.preventDefault();
  handler();
  schedule();
});

function setHave(t) {
  const have = settings.get().have;
  if (t.value) have[t.dataset.have] = t.value;
  else delete have[t.dataset.have];
  settings.set({ have });
}

function toggleModule(t) {
  const kind = t.dataset.toggle;
  const list = settings.get()[kind];
  const m = list.find(x => x.id === t.dataset.id);
  if (m) m.on = t.checked;
  settings.set({ [kind]: list });
}

const CHANGES = [
  ['have', setHave],
  ['version', t => { ui.sel[t.dataset.version] = t.value; }],
  ['platform', t => settings.set({ platform: t.value })],
  ['toggle', toggleModule],
  ['pref', t => settings.set({ [t.dataset.pref]: t.checked })],
];

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'file') {
    if (t.files[0]) hashFile(t.files[0]).catch(console.error);
    t.value = '';
    return;
  }
  const handler = CHANGES.find(([key]) => t.dataset[key] !== undefined);
  if (!handler) return;
  handler[1](t);
  schedule();
});

// What is typed into a field that a re-render would otherwise reset.
const INPUTS = {
  search: value => {
    ui.search.q = value;
    queueSearch();
  },
  dep: value => { ui.dep = value; },
  draft: value => { ui.draft = value; },
};

document.addEventListener('input', ev => {
  const handler = INPUTS[ev.target.dataset.input];
  if (!handler) return;
  handler(ev.target.value);
  schedule();
});

document.addEventListener('keydown', ev => {
  if (ev.target.id === 'drop' && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    $('#file').click();
  }
});

const dropZone = ev => ev.target.closest?.('#drop');
document.addEventListener('dragover', ev => {
  const d = dropZone(ev);
  if (!d) return;
  ev.preventDefault();
  d.classList.add('over');
});
document.addEventListener('dragleave', ev => dropZone(ev)?.classList.remove('over'));
document.addEventListener('drop', ev => {
  if (!dropZone(ev)) return;
  ev.preventDefault();
  if (ev.dataTransfer.files[0]) hashFile(ev.dataTransfer.files[0]).catch(console.error);
});

window.addEventListener('hashchange', () => {
  ui.notice = '';
  ui.draft = null;
  schedule();
  window.scrollTo(0, 0);
});

// ---------- boot

async function readConfig() {
  try {
    const res = await fetch('api/config', { cache: 'no-cache' });
    Object.assign(session.config, await res.json());
  } catch {
    // Keep the defaults: a server with no sign-in and no preset projects.
  }
}

async function restoreUser() {
  if (!token.get() || isStatic()) return;
  try {
    session.user = await github.user();
  } catch (e) {
    if (e.status !== 401) return;
    token.clear();
    ui.notice = 'Your sign-in expired. Sign in again.';
  }
}

applyTheme();
await readConfig();
useStaticData(isStatic(), session.config.defaults);
await oauthReturn();
await restoreUser();
render();
