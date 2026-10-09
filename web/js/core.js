// Pure logic: no DOM, no network, no storage. Everything here can be
// tested with `node --test` and is shared by the pages.

// ---------- versions

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// parseTag reads a tag in a project's scope ("cli/" + "v1.2.3-rc.1"). It
// returns null for a tag outside the scope or that isn't semver.
export function parseTag(tag, prefix = '') {
  if (!tag.startsWith(prefix)) return null;
  const m = SEMVER.exec(tag.slice(prefix.length));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

const numeric = s => /^\d+$/.test(s);

// compareIdentifier orders two pre-release identifiers: numbers by value and
// before words, words by ASCII.
function compareIdentifier(x, y) {
  const nx = numeric(x), ny = numeric(y);
  if (nx && ny) return Number(x) - Number(y);
  if (nx !== ny) return nx ? -1 : 1;
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

function comparePre(a, b) {
  if (!a.length || !b.length) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const c = compareIdentifier(a[i], b[i]);
    if (c) return c;
  }
  return 0;
}

// compareVersions orders parsed versions by semver precedence.
export function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  return comparePre(a.pre, b.pre);
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

const clamp = (v, max) => Math.min(Math.max(v, 0), max);

// randomart is OpenSSH's drunken bishop over a digest (Uint8Array).
export function randomart(digest, title) {
  const field = Array.from({ length: WIDTH }, () => new Array(HEIGHT).fill(0));
  let x = Math.floor(WIDTH / 2), y = Math.floor(HEIGHT / 2);
  for (let b of digest) {
    for (let i = 0; i < 4; i++) {
      x = clamp(x + (b & 1 ? 1 : -1), WIDTH - 1);
      y = clamp(y + (b & 2 ? 1 : -1), HEIGHT - 1);
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
export const fromHex = h => Uint8Array.from(h.match(/../g), b => Number.parseInt(b, 16));

// ---------- release text

const RETRACTED = '**This release is retracted.**';

// readNotice reads back the retraction notice letsgo yank prepends to a
// release's body, or returns null when there is none.
export function readNotice(body) {
  if (!body?.startsWith('> [!CAUTION]')) return null;
  const n = { reason: '', use: '' };
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^>\s?/, '').trim();
    if (line.startsWith(RETRACTED)) n.reason = line.slice(RETRACTED.length).trim();
    if (line.startsWith('Use ') && line.endsWith(' or later.')) {
      n.use = line.slice('Use '.length, -' or later.'.length).trim();
      break;
    }
  }
  return n;
}

// ---------- projects

const NAME = /^[\w.-]{1,100}$/;
const PREFIX = /^[\w./-]{1,100}$/;

// pathSegment makes one URL path segment out of an owner or repository name
// from the viewer: only the characters GitHub allows in one, and never "."
// or "..", which would climb out of the path. It throws for anything else.
export function pathSegment(name) {
  if (!validName(name)) throw new Error(`"${name}" isn't a valid owner or repository name.`);
  return encodeURIComponent(name);
}

const validName = name => NAME.test(name) && name !== '.' && name !== '..';

// assetID is a release file's numeric ID as it goes in a URL.
export function assetID(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`"${id}" isn't a release file ID.`);
  return String(n);
}

// parseSpec reads "owner/name" or "owner/name@prefix/".
export function parseSpec(s) {
  const parts = String(s).trim().split('@');
  if (parts.length > 2) return null;
  const [repoPart, prefixPart] = parts;
  const names = repoPart.split('/');
  if (names.length !== 2 || !validName(names[0]) || !validName(names[1])) return null;
  let prefix = '';
  if (prefixPart !== undefined) {
    let p = prefixPart;
    while (p.endsWith('/')) p = p.slice(0, -1);
    if (!p || !PREFIX.test(p)) return null;
    prefix = p + '/';
  }
  const id = prefix ? `${names[0]}/${names[1]}@${prefix}` : `${names[0]}/${names[1]}`;
  return { owner: names[0], repo: names[1], prefix, id };
}

// latestStable is the newest stable release that isn't retracted.
export function latestStable(releases) {
  return releases.find(r => !r.prerelease && !r.retracted) || null;
}

// lastAudit is a release's most recent audit entry, or null.
export function lastAudit(r) {
  const a = r.audit?.audits;
  return a?.length ? a[a.length - 1] : null;
}

// status is one word about a release, worst first.
export function status(r) {
  if (r.retracted) return { kind: 'danger', label: 'Retracted' };
  const a = lastAudit(r);
  if (a?.status === 'affected') return { kind: 'danger', label: 'Vulnerable', ids: (a.findings || []).map(f => f.id) };
  if (a) return { kind: 'success', label: 'No known issues', at: String(a.at).slice(0, 10) };
  if (r.prerelease) return { kind: 'secondary', label: 'Pre-release' };
  return { kind: 'secondary', label: 'Not audited' };
}

// moduleVersion is the version a manifest records for a dependency.
export function moduleVersion(manifest, path) {
  const m = manifest?.modules?.list?.find(x => x.path === path);
  return m ? m.version : '';
}

const goVersion = v => parseTag('v' + String(v).replace(/^v/, ''));

// fixes reports whether release x no longer has a finding: by the
// dependency's fixed version when the audit gave one and the manifest is
// loaded, otherwise by x's own latest audit.
function fixes(x, finding) {
  if (finding.fixed && x.manifest) {
    const have = goVersion(moduleVersion(x.manifest, finding.module)), want = goVersion(finding.fixed);
    if (have && want && compareVersions(have, want) >= 0) return true;
  }
  const a = lastAudit(x);
  return Boolean(a) && !(a.findings || []).some(f => f.id === finding.id);
}

// fixedIn is the first newer stable, unretracted release without a finding.
export function fixedIn(releases, r, finding) {
  return releases
    .filter(x => !x.prerelease && !x.retracted && compareVersions(x.version, r.version) > 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .find(x => fixes(x, finding)) || null;
}

// verdict is what to tell someone who runs `have` (a release or null).
export function verdict(releases, have) {
  const latest = latestStable(releases);
  if (!have) return { kind: 'none', target: latest };
  if (have.retracted) return { kind: 'danger', title: `${have.tag} was retracted`, text: have.retracted.reason || 'The maintainer withdrew it.', target: latest };
  const a = lastAudit(have);
  if (a?.status === 'affected' && a.findings?.length) {
    const fx = fixedIn(releases, have, a.findings[0]);
    const ids = a.findings.map(f => f.id).join(', ');
    const fix = fx ? `Fixed in ${fx.tag}.` : 'No fixed release yet.';
    return { kind: 'danger', title: `${have.tag} has a known vulnerability`, text: `${ids}. ${fix}`, target: fx || latest };
  }
  if (latest && compareVersions(latest.version, have.version) > 0) return { kind: 'attention', title: `Update available: ${latest.tag}`, text: '', target: latest };
  return { kind: 'success', title: 'Up to date', text: '', target: latest };
}

// gate is what a release's manifest says about a gate, following
// promoted_from to the release candidate when the stable didn't record it.
export function gate(r, name, byTag) {
  const own = r.manifest?.gates?.[name];
  if (own) return own;
  const rc = byTag[r.manifest?.promoted_from?.tag];
  return rc?.manifest?.gates?.[name] || '';
}

function executables(a) {
  if (a.binaries?.length) return a.binaries;
  if (a.binary) return [{ name: a.binary, size: a.binary_size, sha256: a.binary_sha256 }];
  return [];
}

// artifacts lists a manifest's archives with their executables.
export function artifacts(manifest) {
  return (manifest.artifacts || []).filter(a => a.os).map(a => ({
    name: a.name, os: a.os, arch: a.arch, platform: `${a.os}/${a.arch}`, size: a.size, sha256: a.sha256, variant: a.variant || '',
    binaries: executables(a),
  }));
}

// digests lists every SHA-256 a manifest vouches for, for checking a file.
export function digests(manifest) {
  const out = [];
  for (const a of artifacts(manifest)) {
    const where = a.variant ? `${a.platform} (${a.variant})` : a.platform;
    out.push({ sha256: a.sha256, what: `${where} archive`, file: a.name });
    for (const b of a.binaries) {
      if (b.sha256) out.push({ sha256: b.sha256, what: `${a.platform} executable`, file: b.name });
    }
  }
  if (manifest.source) out.push({ sha256: manifest.source.sha256, what: 'source archive', file: manifest.source.archive });
  for (const i of manifest.images || []) out.push({ sha256: String(i.digest).replace(/^sha256:/, ''), what: 'container image', file: i.reference });
  return out;
}

const dependencyMap = m => Object.fromEntries((m.modules?.list || []).map(x => [x.path, x.version]));

// changes summarises what moving from one release to another brings, from
// the manifests of every stable release between them.
export function changes(releases, from, to, platform) {
  const span = releases.filter(r => !r.prerelease && compareVersions(r.version, from.version) > 0 && compareVersions(r.version, to.version) <= 0);
  const out = { span, api: [], deps: [], go: null, size: null, retracted: span.filter(r => r.retracted), missing: span.filter(r => !r.manifest) };
  for (const r of span) {
    for (const c of r.manifest?.api_changes || []) out.api.push({ ...c, tag: r.tag });
  }
  const fm = dependencyMap(from.manifest), tm = dependencyMap(to.manifest);
  for (const k of new Set([...Object.keys(fm), ...Object.keys(tm)])) {
    if (fm[k] !== tm[k]) out.deps.push({ path: k, from: fm[k] || '', to: tm[k] || '' });
  }
  if (from.manifest.builder.go !== to.manifest.builder.go) out.go = { from: from.manifest.builder.go, to: to.manifest.builder.go };
  const pick = m => artifacts(m).find(a => a.platform === platform && !a.variant);
  const fa = pick(from.manifest), ta = pick(to.manifest);
  if (fa && ta) out.size = { from: fa.size, to: ta.size };
  return out;
}

export function formatSize(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}
// plural: "1 release", "2 releases".
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const shortDate = s => String(s || '').slice(0, 10);
