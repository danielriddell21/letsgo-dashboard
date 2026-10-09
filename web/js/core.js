// Pure logic: no DOM, no network, no storage. Everything here can be
// tested with `node --test` and is shared by the pages.

// ---------- versions

// parseTag reads a tag in a project's scope ("cli/" + "v1.2.3-rc.1"). It
// returns null for a tag outside the scope or that isn't semver.
export function parseTag(tag, prefix = '') {
  if (!tag.startsWith(prefix)) return null;
  const m = tag.slice(prefix.length).match(/^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

// compareVersions orders parsed versions by semver precedence.
export function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] - b[k];
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x - +y;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------- fingerprints, exactly as letsgo verify draws them

const GLYPHS = ' .o+=*BOX@%&#/^SE';
const WIDTH = 17, HEIGHT = 9;

function frame(text) {
  let label = '[' + text + ']';
  if (label.length > WIDTH) label = label.slice(0, WIDTH);
  const pad = WIDTH - label.length, left = Math.floor(pad / 2);
  return '+' + '-'.repeat(left) + label + '-'.repeat(pad - left) + '+';
}

export function randomartTitle(tag) {
  const title = 'letsgo ' + tag;
  return title.length + 2 <= WIDTH ? title : tag;
}

// randomart is OpenSSH's drunken bishop over a digest (Uint8Array).
export function randomart(digest, title) {
  const field = Array.from({ length: WIDTH }, () => new Array(HEIGHT).fill(0));
  let x = Math.floor(WIDTH / 2), y = Math.floor(HEIGHT / 2);
  for (let b of digest) {
    for (let i = 0; i < 4; i++) {
      x = Math.min(Math.max(x + (b & 1 ? 1 : -1), 0), WIDTH - 1);
      y = Math.min(Math.max(y + (b & 2 ? 1 : -1), 0), HEIGHT - 1);
      field[x][y] = Math.min(field[x][y] + 1, GLYPHS.length - 3);
      b >>= 2;
    }
  }
  field[Math.floor(WIDTH / 2)][Math.floor(HEIGHT / 2)] = GLYPHS.length - 2;
  field[x][y] = GLYPHS.length - 1;
  const rows = [frame(title)];
  for (let r = 0; r < HEIGHT; r++) {
    let line = '|';
    for (let c = 0; c < WIDTH; c++) line += GLYPHS[field[c][r]];
    rows.push(line + '|');
  }
  rows.push(frame('SHA256'));
  return rows.join('\n');
}

const EVEN = [
  "aardvark", "absurd", "accrue", "acme", "adrift", "adult", "afflict", "ahead", "aimless",
  "Algol", "allow", "alone", "ammo", "ancient", "apple", "artist", "assume", "Athens", "atlas",
  "Aztec", "baboon", "backfield", "backward", "banjo", "beaming", "bedlamp", "beehive", "beeswax",
  "befriend", "Belfast", "berserk", "billiard", "bison", "blackjack", "blockade", "blowtorch",
  "bluebird", "bombast", "bookshelf", "brackish", "breadline", "breakup", "brickyard", "briefcase",
  "Burbank", "button", "buzzard", "cement", "chairlift", "chatter", "checkup", "chisel", "choking",
  "chopper", "Christmas", "clamshell", "classic", "classroom", "cleanup", "clockwork", "cobra",
  "commence", "concert", "cowbell", "crackdown", "cranky", "crowfoot", "crucial", "crumpled",
  "crusade", "cubic", "dashboard", "deadbolt", "deckhand", "dogsled", "dragnet", "drainage",
  "dreadful", "drifter", "dropper", "drumbeat", "drunken", "Dupont", "dwelling", "eating", "edict",
  "egghead", "eightball", "endorse", "endow", "enlist", "erase", "escape", "exceed", "eyeglass",
  "eyetooth", "facial", "fallout", "flagpole", "flatfoot", "flytrap", "fracture", "framework",
  "freedom", "frighten", "gazelle", "Geiger", "glitter", "glucose", "goggles", "goldfish",
  "gremlin", "guidance", "hamlet", "highchair", "hockey", "indoors", "indulge", "inverse",
  "involve", "island", "jawbone", "keyboard", "kickoff", "kiwi", "klaxon", "locale", "lockup",
  "merit", "minnow", "miser", "Mohawk", "mural", "music", "necklace", "Neptune", "newborn",
  "nightbird", "Oakland", "obtuse", "offload", "optic", "orca", "payday", "peachy", "pheasant",
  "physique", "playhouse", "Pluto", "preclude", "prefer", "preshrunk", "printer", "prowler",
  "pupil", "puppy", "python", "quadrant", "quiver", "quota", "ragtime", "ratchet", "rebirth",
  "reform", "regain", "reindeer", "rematch", "repay", "retouch", "revenge", "reward", "rhythm",
  "ribcage", "ringbolt", "robust", "rocker", "ruffled", "sailboat", "sawdust", "scallion",
  "scenic", "scorecard", "Scotland", "seabird", "select", "sentence", "shadow", "shamrock",
  "showgirl", "skullcap", "skydive", "slingshot", "slowdown", "snapline", "snapshot", "snowcap",
  "snowslide", "solo", "southward", "soybean", "spaniel", "spearhead", "spellbind", "spheroid",
  "spigot", "spindle", "spyglass", "stagehand", "stagnate", "stairway", "standard", "stapler",
  "steamship", "sterling", "stockman", "stopwatch", "stormy", "sugar", "surmount", "suspense",
  "sweatband", "swelter", "tactics", "talon", "tapeworm", "tempest", "tiger", "tissue", "tonic",
  "topmost", "tracker", "transit", "trauma", "treadmill", "Trojan", "trouble", "tumor", "tunnel",
  "tycoon", "uncut", "unearth", "unwind", "uproot", "upset", "upshot", "vapor", "village", "virus",
  "Vulcan", "waffle", "wallet", "watchword", "wayside", "willow", "woodlark", "Zulu"
];
const ODD = [
  "adroitness", "adviser", "aftermath", "aggregate", "alkali", "almighty", "amulet", "amusement",
  "antenna", "applicant", "Apollo", "armistice", "article", "asteroid", "Atlantic", "atmosphere",
  "autopsy", "Babylon", "backwater", "barbecue", "belowground", "bifocals", "bodyguard",
  "bookseller", "borderline", "bottomless", "Bradbury", "bravado", "Brazilian", "breakaway",
  "Burlington", "businessman", "butterfat", "Camelot", "candidate", "cannonball", "Capricorn",
  "caravan", "caretaker", "celebrate", "cellulose", "certify", "chambermaid", "Cherokee",
  "Chicago", "clergyman", "coherence", "combustion", "commando", "company", "component",
  "concurrent", "confidence", "conformist", "congregate", "consensus", "consulting", "corporate",
  "corrosion", "councilman", "crossover", "crucifix", "cumbersome", "customer", "Dakota",
  "decadence", "December", "decimal", "designing", "detector", "detergent", "determine",
  "dictator", "dinosaur", "direction", "disable", "disbelief", "disruptive", "distortion",
  "document", "embezzle", "enchanting", "enrollment", "enterprise", "equation", "equipment",
  "escapade", "Eskimo", "everyday", "examine", "existence", "exodus", "fascinate", "filament",
  "finicky", "forever", "fortitude", "frequency", "gadgetry", "Galveston", "getaway", "glossary",
  "gossamer", "graduate", "gravity", "guitarist", "hamburger", "Hamilton", "handiwork",
  "hazardous", "headwaters", "hemisphere", "hesitate", "hideaway", "holiness", "hurricane",
  "hydraulic", "impartial", "impetus", "inception", "indigo", "inertia", "infancy", "inferno",
  "informant", "insincere", "insurgent", "integrate", "intention", "inventive", "Istanbul",
  "Jamaica", "Jupiter", "leprosy", "letterhead", "liberty", "maritime", "matchmaker", "maverick",
  "Medusa", "megaton", "microscope", "microwave", "midsummer", "millionaire", "miracle",
  "misnomer", "molasses", "molecule", "Montana", "monument", "mosquito", "narrative", "nebula",
  "newsletter", "Norwegian", "October", "Ohio", "onlooker", "opulent", "Orlando", "outfielder",
  "Pacific", "pandemic", "Pandora", "paperweight", "paragon", "paragraph", "paramount",
  "passenger", "pedigree", "Pegasus", "penetrate", "perceptive", "performance", "pharmacy",
  "phonetic", "photograph", "pioneer", "pocketful", "politeness", "positive", "potato",
  "processor", "provincial", "proximate", "puberty", "publisher", "pyramid", "quantity",
  "racketeer", "rebellion", "recipe", "recover", "repellent", "replica", "reproduce", "resistor",
  "responsive", "retraction", "retrieval", "retrospect", "revenue", "revival", "revolver",
  "sandalwood", "sardonic", "Saturday", "savagery", "scavenger", "sensation", "sociable",
  "souvenir", "specialist", "speculate", "stethoscope", "stupendous", "supportive", "surrender",
  "suspicious", "sympathy", "tambourine", "telephone", "therapist", "tobacco", "tolerance",
  "tomorrow", "torpedo", "tradition", "travesty", "trombonist", "truncated", "typewriter",
  "ultimate", "undaunted", "underfoot", "unicorn", "unify", "universe", "unravel", "upcoming",
  "vacancy", "vagabond", "vertigo", "Virginia", "visitor", "vocalist", "voyager", "warranty",
  "Waterloo", "whimsical", "Wichita", "Wilmington", "Wyoming", "yesteryear", "Yucatan"
];

// pgpWords spells a digest in the PGP word list, alternating the two tables.
export function pgpWords(digest) {
  return Array.from(digest, (b, i) => (i % 2 === 0 ? EVEN : ODD)[b]);
}

export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

// ---------- release text

// readNotice reads back the retraction notice letsgo yank prepends to a
// release's body, or returns null when there is none.
export function readNotice(body) {
  if (!body || !body.startsWith('> [!CAUTION]')) return null;
  const n = { reason: '', use: '' };
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^>\s?/, '').trim();
    const r = line.match(/^\*\*This release is retracted\.\*\*\s*(.*)$/);
    if (r) n.reason = r[1].trim();
    const u = line.match(/^Use (\S+) or later\.$/);
    if (u) { n.use = u[1]; break; }
  }
  return n;
}

// ---------- projects

// parseSpec reads "owner/name" or "owner/name@prefix/".
export function parseSpec(s) {
  const m = String(s).trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([A-Za-z0-9_.\/-]+?)\/?)?$/);
  if (!m) return null;
  const prefix = m[3] ? m[3] + '/' : '';
  return { owner: m[1], repo: m[2], prefix, id: `${m[1]}/${m[2]}${prefix ? '@' + prefix : ''}` };
}

// latestStable is the newest stable release that isn't retracted.
export function latestStable(releases) {
  return releases.find(r => !r.prerelease && !r.retracted) || null;
}

// lastAudit is a release's most recent audit entry, or null.
export function lastAudit(r) {
  const a = r.audit && r.audit.audits;
  return a && a.length ? a[a.length - 1] : null;
}

// status is one word about a release, worst first.
export function status(r) {
  if (r.retracted) return { kind: 'danger', label: 'Retracted' };
  const a = lastAudit(r);
  if (a && a.status === 'affected') return { kind: 'danger', label: 'Vulnerable', ids: (a.findings || []).map(f => f.id) };
  if (a) return { kind: 'success', label: 'No known issues', at: String(a.at).slice(0, 10) };
  if (r.prerelease) return { kind: 'secondary', label: 'Pre-release' };
  if (r.hasAudit === false || r.audit === null) return { kind: 'secondary', label: 'Not audited' };
  return { kind: 'secondary', label: 'Not audited' };
}

// moduleVersion is the version a manifest records for a dependency.
export function moduleVersion(manifest, path) {
  const m = manifest && manifest.modules && (manifest.modules.list || []).find(x => x.path === path);
  return m ? m.version : '';
}

const goVersion = v => parseTag(v) || parseTag('v' + String(v).replace(/^v/, ''));

// fixedIn is the first newer stable, unretracted release that no longer has
// a finding: by the dependency's fixed version when the audit gave one and
// the manifest is loaded, otherwise by that release's own latest audit.
export function fixedIn(releases, r, finding) {
  const newer = releases.filter(x => !x.prerelease && !x.retracted && compareVersions(x.version, r.version) > 0)
    .sort((a, b) => compareVersions(a.version, b.version));
  for (const x of newer) {
    if (finding.fixed && x.manifest) {
      const have = goVersion(moduleVersion(x.manifest, finding.module)), want = goVersion(finding.fixed);
      if (have && want && compareVersions(have, want) >= 0) return x;
    }
    const a = lastAudit(x);
    if (a && !(a.findings || []).some(f => f.id === finding.id)) return x;
  }
  return null;
}

// verdict is what to tell someone who runs `have` (a release or null).
export function verdict(releases, have) {
  const latest = latestStable(releases);
  if (!have) return { kind: 'none', target: latest };
  if (have.retracted) return { kind: 'danger', title: `${have.tag} was retracted`, text: have.retracted.reason || 'The maintainer withdrew it.', target: latest };
  const a = lastAudit(have);
  if (a && a.status === 'affected' && (a.findings || []).length) {
    const fx = fixedIn(releases, have, a.findings[0]);
    return { kind: 'danger', title: `${have.tag} has a known vulnerability`, text: `${a.findings.map(f => f.id).join(', ')}. ${fx ? `Fixed in ${fx.tag}.` : 'No fixed release yet.'}`, target: fx || latest };
  }
  if (latest && compareVersions(latest.version, have.version) > 0) return { kind: 'attention', title: `Update available: ${latest.tag}`, text: '', target: latest };
  return { kind: 'success', title: 'Up to date', text: '', target: latest };
}

// gate is what a release's manifest says about a gate, following
// promoted_from to the release candidate when the stable didn't record it.
export function gate(r, name, byTag) {
  const g = r.manifest && r.manifest.gates || {};
  if (g[name]) return g[name];
  const pf = r.manifest && r.manifest.promoted_from;
  const rc = pf && byTag[pf.tag];
  return rc && rc.manifest && rc.manifest.gates && rc.manifest.gates[name] || '';
}

// artifacts lists a manifest's archives with their executables.
export function artifacts(manifest) {
  return (manifest.artifacts || []).filter(a => a.os).map(a => ({
    name: a.name, os: a.os, arch: a.arch, platform: `${a.os}/${a.arch}`, size: a.size, sha256: a.sha256, variant: a.variant || '',
    binaries: a.binaries && a.binaries.length ? a.binaries : a.binary ? [{ name: a.binary, size: a.binary_size, sha256: a.binary_sha256 }] : [],
  }));
}

// digests lists every SHA-256 a manifest vouches for, for checking a file.
export function digests(manifest) {
  const out = [];
  for (const a of artifacts(manifest)) {
    out.push({ sha256: a.sha256, what: `${a.platform}${a.variant ? ' (' + a.variant + ')' : ''} archive`, file: a.name });
    for (const b of a.binaries) if (b.sha256) out.push({ sha256: b.sha256, what: `${a.platform} executable`, file: b.name });
  }
  if (manifest.source) out.push({ sha256: manifest.source.sha256, what: 'source archive', file: manifest.source.archive });
  for (const i of manifest.images || []) out.push({ sha256: String(i.digest).replace(/^sha256:/, ''), what: 'container image', file: i.reference });
  return out;
}

// changes summarises what moving from one release to another brings, from
// the manifests of every stable release between them.
export function changes(releases, from, to, platform) {
  const span = releases.filter(r => !r.prerelease && compareVersions(r.version, from.version) > 0 && compareVersions(r.version, to.version) <= 0);
  const out = { span, api: [], deps: [], go: null, size: null, retracted: span.filter(r => r.retracted), missing: span.filter(r => !r.manifest) };
  for (const r of span) for (const c of (r.manifest && r.manifest.api_changes) || []) out.api.push({ ...c, tag: r.tag });
  const fm = Object.fromEntries(((from.manifest.modules || {}).list || []).map(m => [m.path, m.version]));
  const tm = Object.fromEntries(((to.manifest.modules || {}).list || []).map(m => [m.path, m.version]));
  for (const k of new Set([...Object.keys(fm), ...Object.keys(tm)])) if (fm[k] !== tm[k]) out.deps.push({ path: k, from: fm[k] || '', to: tm[k] || '' });
  if (from.manifest.builder.go !== to.manifest.builder.go) out.go = { from: from.manifest.builder.go, to: to.manifest.builder.go };
  const fa = artifacts(from.manifest).find(a => a.platform === platform && !a.variant), ta = artifacts(to.manifest).find(a => a.platform === platform && !a.variant);
  if (fa && ta) out.size = { from: fa.size, to: ta.size };
  return out;
}

export const formatSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
export const shortDate = s => String(s || '').slice(0, 10);

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);
