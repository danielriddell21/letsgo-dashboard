// What the dashboard remembers lives here, in this browser's localStorage:
// the viewer's settings and, if they sign in, their token. Nothing is stored
// on the server, and nothing GitHub returns is written here.

const P = 'lgd:';

function read(key) {
  try {
    return localStorage.getItem(P + key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(P + key, value);
  } catch {
    // Storage is unavailable or full; the page still works for this visit.
  }
}
function remove(key) {
  try {
    localStorage.removeItem(P + key);
  } catch {
    // Storage is unavailable.
  }
}

// Modules are the pieces the overview and project pages are made of. Each
// can be shown, hidden and reordered in Settings.
export const OVERVIEW_MODULES = [
  { id: 'attention', title: 'Needs attention' },
  { id: 'projects', title: 'Projects' },
  { id: 'recent', title: 'Recent releases' },
  { id: 'advisories', title: 'Advisories' },
  { id: 'dependencies', title: 'Dependency search' },
  { id: 'verify', title: 'Verify a file' },
];
export const PROJECT_SECTIONS = [
  { id: 'install', title: 'Install' },
  { id: 'changes', title: 'Changes from your version' },
  { id: 'provenance', title: 'Security and provenance' },
  { id: 'dependencies', title: 'Dependencies' },
  { id: 'versions', title: 'Versions' },
  { id: 'details', title: 'Details', side: true },
  { id: 'plugins', title: 'Plugins', side: true },
  { id: 'fingerprint', title: 'Fingerprint', side: true },
];

const THEMES = ['auto', 'light', 'dark', 'dark_dimmed'];
const SPEC = /^[\w.-]{1,100}\/[\w.-]{1,100}(?:@[\w./-]{1,100})?$/;
const TAG = /^[\w./+-]{1,200}$/;
const PLATFORM = /^[a-z0-9]{1,20}\/[a-z0-9]{1,20}$/;

// layout keeps the known modules, in the saved order, with a module added in
// a later version shown and a removed one dropped.
function layout(saved, known) {
  const ids = new Set(known.map(k => k.id));
  const out = (Array.isArray(saved) ? saved : []).filter(m => ids.has(m?.id)).map(m => ({ id: m.id, on: Boolean(m.on) }));
  for (const k of known) {
    if (!out.some(m => m.id === k.id)) out.push({ id: k.id, on: true });
  }
  return out;
}

// clean turns anything that claims to be settings into settings: every
// field checked against what it may hold, everything else dropped.
function clean(s) {
  const src = s && typeof s === 'object' ? s : {};
  const have = {};
  for (const [k, v] of Object.entries(src.have && typeof src.have === 'object' ? src.have : {})) {
    if (SPEC.test(k) && typeof v === 'string' && TAG.test(v)) have[k] = v;
  }
  const projects = Array.isArray(src.projects) ? src.projects.filter(p => typeof p === 'string' && SPEC.test(p)) : null;
  return {
    projects,
    have,
    theme: THEMES.includes(src.theme) ? src.theme : 'auto',
    platform: typeof src.platform === 'string' && PLATFORM.test(src.platform) ? src.platform : '',
    overview: layout(src.overview, OVERVIEW_MODULES).map(m => ({ ...m, on: src.overview ? m.on : m.id !== 'recent' })),
    sections: layout(src.sections, PROJECT_SECTIONS),
    prereleases: src.prereleases === true,
  };
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const settings = {
  get() { return clean(parse(read('settings'))); },
  set(patch) { write('settings', JSON.stringify(clean({ ...this.get(), ...patch }))); },
  // export is the viewer's layout and watch list, without the token, so it
  // can be shared or moved to another browser.
  export() { return JSON.stringify(this.get(), null, 2); },
  import(text) {
    const s = parse(text);
    if (!s || typeof s !== 'object') throw new Error('Settings must be a JSON object.');
    write('settings', JSON.stringify(clean(s)));
  },
};

// A GitHub token is letters, digits and underscores (ghp_…, gho_…,
// github_pat_…). Anything else isn't one, and isn't stored.
const TOKEN = /^\w{20,255}$/;

export const token = {
  get() {
    const t = read('token') || '';
    return TOKEN.test(t) ? t : '';
  },
  set(t) {
    if (!TOKEN.test(t)) throw new Error("That doesn't look like a GitHub token.");
    write('token', t);
  },
  clear() { remove('token'); },
};

// forgetEverything removes all the dashboard has stored in this browser.
export function forgetEverything() {
  let keys = [];
  try {
    keys = Object.keys(localStorage);
  } catch {
    return;
  }
  for (const k of keys) {
    if (k.startsWith(P)) remove(k.slice(P.length));
  }
}
