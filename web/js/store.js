// Everything the dashboard remembers lives here, in this browser's
// localStorage. Nothing is stored on the server.

const P = 'lgd:';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(P + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) { try { localStorage.removeItem(P + key); } catch { /* storage unavailable */ } }

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

const DEFAULTS = {
  projects: null, // null until the viewer chooses; then the server's defaults stop applying
  have: {},
  theme: 'auto',
  platform: '',
  overview: OVERVIEW_MODULES.map(m => ({ id: m.id, on: m.id !== 'recent' })),
  sections: PROJECT_SECTIONS.map(m => ({ id: m.id, on: true })),
  prereleases: false,
};

// layout merges a saved list of modules with the known ones, so a module
// added in a later version shows up and a removed one disappears.
function layout(saved, known) {
  const ids = new Set(known.map(k => k.id));
  const out = (Array.isArray(saved) ? saved : []).filter(m => m && ids.has(m.id)).map(m => ({ id: m.id, on: !!m.on }));
  for (const k of known) if (!out.some(m => m.id === k.id)) out.push({ id: k.id, on: true });
  return out;
}

export const settings = {
  get() {
    const s = { ...DEFAULTS, ...read('settings', {}) };
    s.overview = layout(s.overview, OVERVIEW_MODULES);
    s.sections = layout(s.sections, PROJECT_SECTIONS);
    return s;
  },
  set(patch) { write('settings', { ...this.get(), ...patch }); },
  // export is the viewer's layout and watch list, without the token, so it
  // can be shared or moved to another browser.
  export() { return JSON.stringify(this.get(), null, 2); },
  import(text) {
    const s = JSON.parse(text);
    if (typeof s !== 'object' || s === null) throw new Error('Settings must be a JSON object.');
    const keep = {};
    for (const k of Object.keys(DEFAULTS)) if (k in s) keep[k] = s[k];
    write('settings', { ...DEFAULTS, ...keep });
  },
};

export const token = {
  get() { return read('token', ''); },
  set(t) { write('token', t); },
  clear() { remove('token'); },
};

// The cache holds what GitHub returned, so a page reload doesn't spend the
// rate limit again. Release files are cached for good (an asset ID never
// changes content); lists expire. When storage fills, the oldest entries go.
export const cache = {
  get(key, maxAgeMs) {
    const e = read('c:' + key, null);
    if (!e) return undefined;
    if (maxAgeMs && Date.now() - e.t > maxAgeMs) return undefined;
    return e.v;
  },
  put(key, value) {
    const entry = { t: Date.now(), v: value };
    for (let i = 0; i < 8; i++) {
      if (write('c:' + key, entry)) return;
      if (!evictOldest(10)) return;
    }
  },
  clear() { for (const k of keys()) if (k.startsWith(P + 'c:')) localStorage.removeItem(k); },
  size() { let n = 0; for (const k of keys()) if (k.startsWith(P + 'c:')) n += (localStorage.getItem(k) || '').length; return n; },
};

function keys() { try { return Object.keys(localStorage); } catch { return []; } }
function evictOldest(n) {
  const entries = keys().filter(k => k.startsWith(P + 'c:')).map(k => {
    try { return [k, JSON.parse(localStorage.getItem(k)).t || 0]; } catch { return [k, 0]; }
  }).sort((a, b) => a[1] - b[1]).slice(0, n);
  for (const [k] of entries) localStorage.removeItem(k);
  return entries.length > 0;
}

// forgetEverything removes all the dashboard has stored in this browser.
export function forgetEverything() { for (const k of keys()) if (k.startsWith(P)) localStorage.removeItem(k); }
