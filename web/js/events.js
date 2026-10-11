// What the viewer does. The page listens once, on the document: each control
// carries a data attribute naming what it does, and these tables map that
// name to a handler. Every handler is followed by a re-render.

import * as core from './core.js';
import { settings } from './store.js';
import { github } from './github.js';
import { ui, route, schedule } from './state.js';
import { watch, unwatch, findProject, loadProject, forgetProjects } from './projects.js';
import { signIn, signOut, forgetAll, oauthStart } from './auth.js';
import { hashFile, checkHash } from './views/verify.js';

const $ = sel => document.querySelector(sel);
const value = id => document.getElementById(id).value;

// watchSpec watches what was typed, or says why it can't.
function watchSpec(text) {
  const spec = core.parseSpec(text);
  if (!spec) {
    ui.notice = 'Enter owner/repo, or owner/repo@prefix/ for one module of a monorepo.';
    return false;
  }
  watch(spec);
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

// move swaps a module with its neighbour in an overview or project layout.
function move(kind, id, dir) {
  const list = settings.get()[kind];
  const i = list.findIndex(m => m.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  settings.set({ [kind]: list });
}

function importSettings() {
  try {
    settings.import(value('settings-json'));
    ui.notice = '';
    ui.draft = null;
    forgetProjects();
  } catch (e) {
    ui.notice = `That isn't valid settings JSON: ${e.message}`;
  }
}

const pickFile = () => $('#file').click();

function verifyFile(f) {
  if (f) hashFile(f).catch(console.error);
}

// ---------- clicks

const ACTIONS = {
  retry: t => {
    const p = findProject(t.dataset.project);
    if (p) loadProject(p, true).catch(console.error);
  },
  watch: t => watchSpec(t.dataset.project),
  unwatch: t => unwatch(t.dataset.project),
  'add-example': () => watchSpec('danielriddell21/letsgo'),
  'all-versions': () => { ui.allVersions = !ui.allVersions; },
  'pick-file': pickFile,
  'my-repos': () => listRepos(github.myRepos).catch(console.error),
  oauth: () => oauthStart().catch(console.error),
  signout: signOut,
  forget: forgetAll,
  import: importSettings,
};

function copy(text, button) {
  navigator.clipboard.writeText(text).then(() => button.setAttribute('aria-label', 'Copied'), () => {});
}

// select picks a release, opening its project when picked from elsewhere.
function select(t, ev) {
  ui.sel[t.dataset.project] = t.dataset.select;
  if (route().name !== 'project') {
    ev.preventDefault();
    location.hash = `#/p/${encodeURIComponent(t.dataset.project)}`;
  }
}

// The first data attribute found decides.
const CLICKS = [
  ['copy', t => copy(t.dataset.copy, t)],
  ['copyFrom', t => copy(value(t.dataset.copyFrom), t)],
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

// ---------- forms

const SUBMITS = {
  search: () => runSearch().catch(console.error),
  owner: () => {
    const owner = value('owner-in').trim();
    ui.addOwner = owner;
    if (/^[\w.-]+$/.test(owner)) listRepos(() => github.ownerRepos(owner)).catch(console.error);
  },
  token: () => {
    const t = value('token-in').trim();
    if (t) signIn(t).catch(console.error);
  },
  hash: () => checkHash(value('hash-in')),
};

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

// What is typed into a field that a re-render would otherwise reset.
const INPUTS = {
  search: v => {
    ui.search.q = v;
    queueSearch();
  },
  dep: v => { ui.dep = v; },
  draft: v => { ui.draft = v; },
};

// handlerFor finds the first [attribute, handler] pair the element carries.
const handlerFor = (table, el) => table.find(([key]) => el.dataset[key] !== undefined)?.[1];

// ---------- listening

const dropZone = ev => ev.target.closest?.('#drop');

export function listen() {
  document.addEventListener('click', ev => {
    const t = ev.target.closest('button, a, [data-select], [data-action]');
    const handler = t && handlerFor(CLICKS, t);
    if (!handler) return;
    handler(t, ev);
    schedule();
  });

  document.addEventListener('submit', ev => {
    const handler = SUBMITS[ev.target.dataset.form];
    if (!handler) return;
    ev.preventDefault();
    handler();
    schedule();
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'file') {
      verifyFile(t.files[0]);
      t.value = '';
      return;
    }
    const handler = handlerFor(CHANGES, t);
    if (!handler) return;
    handler(t);
    schedule();
  });

  document.addEventListener('input', ev => {
    const handler = INPUTS[ev.target.dataset.input];
    if (!handler) return;
    handler(ev.target.value);
    schedule();
  });

  document.addEventListener('keydown', ev => {
    if (ev.target.id === 'drop' && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      pickFile();
    }
  });

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
    verifyFile(ev.dataTransfer.files[0]);
  });

  window.addEventListener('hashchange', () => {
    ui.notice = '';
    ui.draft = null;
    schedule();
    window.scrollTo(0, 0);
  });
}
