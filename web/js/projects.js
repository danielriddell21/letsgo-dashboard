// Watched projects and their releases, loaded from GitHub as the pages need
// them. Each load re-renders when it lands.

import * as core from './core.js';
import { settings } from './store.js';
import { github, ApiError } from './github.js';
import { session, schedule } from './state.js';

const projects = new Map();

// reportError records a failure nothing else is waiting on.
function reportError(e) {
  console.error(e);
}

export function watched() {
  const s = settings.get();
  return (s.projects ?? session.config.defaults).map(core.parseSpec).filter(Boolean);
}
export function setWatched(ids) { settings.set({ projects: ids }); }
export function forgetProjects() { projects.clear(); }
// pinned is the watched projects in the order the overview lists them:
// those released with letsgo first, then those still loading, then the rest,
// each group in the order they were pinned.
export function pinned() {
  const rank = p => {
    if (p.status === 'ready') return p.supported ? 0 : 2;
    return p.status === 'error' ? 2 : 1;
  };
  return watched().map(project).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
}

export const have = p => p.byTag[settings.get().have[p.id]] || null;

// project returns a project's state, starting its load the first time.
export function project(spec) {
  let p = projects.get(spec.id);
  if (!p) {
    p = { ...spec, status: 'idle', error: '', meta: null, releases: [], byTag: {}, supported: false };
    projects.set(spec.id, p);
    loadProject(p).catch(reportError);
  }
  return p;
}
export const findProject = id => projects.get(id);

function toRelease(p, x) {
  const version = core.parseTag(x.tag, p.prefix);
  if (x.draft || !version) return null;
  const hasManifest = 'letsgo.json' in x.assets;
  return {
    tag: x.tag, version, prerelease: version.pre.length > 0, retracted: core.readNotice(x.body),
    url: x.url?.startsWith('https://') ? x.url : '', published: x.published, assets: x.assets,
    files: x.files || [], hasManifest, manifest: hasManifest ? undefined : null, audit: 'audit.json' in x.assets ? undefined : null,
  };
}

async function readMeta(p) {
  try {
    return await github.repo(p.owner, p.repo);
  } catch (e) {
    if (e.status === 404) throw new ApiError(404, `${p.owner}/${p.repo} doesn't exist, or your GitHub account can't read it.`);
    throw e;
  }
}

export async function loadProject(p, fresh) {
  p.status = 'loading';
  schedule();
  try {
    const [meta, list] = await Promise.all([readMeta(p), github.releases(p.owner, p.repo, fresh)]);
    const releases = list.map(x => toRelease(p, x)).filter(Boolean).sort((a, b) => core.compareVersions(b.version, a.version));
    p.meta = meta;
    p.releases = releases;
    p.supported = releases.some(r => r.hasManifest);
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
function pump() {
  while (active < 6 && queue.length) {
    active++;
    queue.shift()().finally(() => {
      active--;
      pump();
    });
  }
}
function limited(fn) {
  return new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    pump();
  });
}

async function loadManifest(p, r) {
  try {
    const { text, sha256 } = await github.asset(p.owner, p.repo, r.assets['letsgo.json']);
    r.manifest = JSON.parse(text);
    r.sha256 = sha256;
    const d = core.fromHex(sha256);
    r.art = core.randomart(d, core.randomartTitle(r.tag));
    r.words = core.pgpWords(d);
  } catch (e) {
    r.manifest = null;
    r.manifestError = e.message;
  }
}

async function loadAudit(p, r) {
  try {
    const { text } = await github.asset(p.owner, p.repo, r.assets['audit.json']);
    r.audit = JSON.parse(text);
  } catch {
    r.audit = null;
  }
}

const inflight = new Set();
// ensure loads a release's manifest or audit once, then re-renders.
export function ensure(p, r, what) {
  if (!r || r[what] !== undefined) return;
  const key = `${p.id}|${r.tag}|${what}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  const load = what === 'manifest' ? loadManifest : loadAudit;
  limited(() => load(p, r))
    .finally(() => {
      inflight.delete(key);
      schedule();
    })
    .catch(reportError);
}

export function ensureAudits(p) {
  for (const r of p.releases) ensure(p, r, 'audit');
}
