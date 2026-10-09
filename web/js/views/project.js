// A project: install, changes from the viewer's version, what each release
// recorded, and its versions. Sections are chosen and ordered in Settings.

import * as core from '../core.js';
import { h, icon } from '../dom.js';
import { settings, PROJECT_SECTIONS } from '../store.js';
import { ui } from '../state.js';
import { watched, have, ensure, ensureAudits } from '../projects.js';
import {
  box, table, flash, blank, spinner, stateEl, statusOf, cmd, copyButton, external, githubLink, vulnLink,
  labelEl, haveSelect, supportLabel,
} from '../ui.js';

export const PLATFORMS = ['darwin/arm64', 'darwin/amd64', 'linux/amd64', 'linux/arm64', 'windows/amd64', 'windows/arm64'];

export function platform() {
  const p = settings.get().platform;
  if (p) return p;
  const agent = navigator.userAgent;
  if (agent.includes('Mac')) return 'darwin/arm64';
  if (agent.includes('Win')) return 'windows/amd64';
  return 'linux/amd64';
}

const repoPath = p => `${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}`;

function header(p) {
  const watching = watched().some(s => s.id === p.id);
  const button = watching
    ? h('button', { class: 'btn btn-sm', 'data-action': 'unwatch', 'data-project': p.id }, 'Unpin')
    : h('button', { class: 'btn btn-sm btn-primary', 'data-action': 'watch', 'data-project': p.id }, 'Pin');
  return [
    h('div', { class: 'row' },
      p.meta?.avatar ? h('img', { class: 'avatar avatar-md', src: p.meta.avatar, alt: '' }) : null,
      h('h1', {}, githubLink(encodeURIComponent(p.owner), p.owner), ' / ', githubLink(repoPath(p), h('b', {}, p.repo))),
      p.prefix ? labelEl(p.prefix) : null,
      supportLabel(p),
      p.meta?.private ? h('span', { class: 'Label' }, icon('lock'), ' Private') : null,
      h('span', { class: 'grow' }),
      button),
    p.meta?.description ? h('p', { class: 'muted' }, p.meta.description) : null,
  ];
}

// ---------- install

function artifactRow(a) {
  return h('tr', {},
    h('td', { class: 'mono' }, a.name, a.variant ? [' ', labelEl(a.variant)] : null,
      a.binaries.length > 1 ? h('div', { class: 'small muted' }, a.binaries.map(b => b.name).join(', ')) : null),
    h('td', { class: 'r nowrap' }, core.formatSize(a.size)),
    h('td', { class: 'nowrap' }, h('code', { title: a.sha256 }, a.sha256.slice(0, 12)), copyButton(a.sha256, 'Copy SHA-256')));
}

function platformSelect(arts, chosen) {
  const options = [...new Set([...PLATFORMS, ...arts.map(a => a.platform)])].map(x => h('option', { selected: x === chosen }, x));
  return h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'Platform'), h('select', { class: 'form-select', id: 'plat', 'data-platform': '' }, options));
}

function downloadTab(p, r) {
  const plat = platform(), arts = core.artifacts(r.manifest);
  const mine = arts.filter(a => a.platform === plat), rest = arts.filter(a => a.platform !== plat);
  const empty = h('tr', {}, h('td', { class: 'muted' }, `No ${plat} build in this release.`));
  const privateDownload = p.meta?.private && mine.length
    ? [cmd(`gh release download ${r.tag} -R ${p.owner}/${p.repo} -p ${mine[0].name}`), h('p', { class: 'small muted' }, 'Private repository: download with your GitHub sign-in.')]
    : null;
  const others = rest.length
    ? h('details', {}, h('summary', { class: 'small muted' }, `Other platforms (${rest.length})`), h('div', { class: 'Box' }, h('table', { class: 'Table' }, h('tbody', {}, rest.map(artifactRow)))))
    : null;
  return [
    h('div', { class: 'row' }, platformSelect(arts, plat)),
    h('div', { class: 'Box' }, h('table', { class: 'Table' }, h('tbody', {}, mine.length ? mine.map(artifactRow) : empty))),
    privateDownload,
    others,
  ];
}

function goTab(p, r) {
  const version = r.tag.slice(p.prefix.length);
  const module = r.manifest.module_dir ? `github.com/${p.owner}/${p.repo}/${r.manifest.module_dir}` : `github.com/${p.owner}/${p.repo}`;
  if (p.meta?.private) {
    return [cmd(`GOPRIVATE=github.com/${p.owner}/* go install ${module}/...@${version}`),
      h('p', { class: 'small muted' }, 'Private module: Go fetches it with your git credentials and skips the public checksum database.')];
  }
  return [cmd(`go install ${module}/...@${version}`), h('p', { class: 'small muted' }, "Builds the module's commands from source with your Go toolchain.")];
}

function dockerTab(p, r) {
  return r.manifest.images.map(i => [
    cmd(`docker pull ${i.reference}@${i.digest}`),
    h('p', { class: 'small muted' }, (i.platforms || []).join(', '), i.base ? [' · based on ', h('code', {}, i.base)] : null, p.meta?.private ? ' · sign in to the registry first' : null),
  ]);
}

const scriptTab = (p, r) => [
  cmd(`curl -fsSL https://github.com/${p.owner}/${p.repo}/releases/download/${r.tag}/install.sh | sh`),
  h('p', { class: 'small muted' }, "The script checks each file's SHA-256 before installing it."),
];

function installTabs(p, r) {
  const tabs = [['download', 'Download', downloadTab]];
  if ('install.sh' in r.assets && !p.meta?.private) tabs.push(['script', 'Install script', scriptTab]);
  tabs.push(['go', 'Go', goTab]);
  if (r.manifest.images?.length) tabs.push(['docker', 'Docker', dockerTab]);
  return tabs;
}

// ---------- releases not made with letsgo, or whose manifest can't be read

function fileRow(f) {
  const sum = f.digest.startsWith('sha256:') ? f.digest.slice('sha256:'.length) : '';
  return h('tr', {},
    h('td', { class: 'mono' }, f.url ? external(f.url, f.name) : f.name),
    h('td', { class: 'r nowrap' }, core.formatSize(f.size)),
    h('td', { class: 'nowrap' }, sum ? [h('code', { title: sum }, sum.slice(0, 12)), copyButton(sum, 'Copy SHA-256')] : h('span', { class: 'muted' }, 'none')));
}

function filesBody(p, r) {
  if (!r.files.length) return h('p', { class: 'muted' }, 'This release has no files attached.');
  const plat = platform();
  const mine = r.files.filter(f => core.matchesPlatform(f.name, plat)), rest = r.files.filter(f => !mine.includes(f));
  const privateDownload = p.meta?.private && mine.length
    ? [cmd(`gh release download ${r.tag} -R ${p.owner}/${p.repo} -p ${mine[0].name}`), h('p', { class: 'small muted' }, 'Private repository: download with your GitHub sign-in.')]
    : null;
  const otherLabel = mine.length ? 'Other files' : 'All files';
  return [
    h('span', { class: 'small muted' }, mine.length ? `Files that look like ${plat}` : `No file looks like ${plat}; all files are below.`),
    mine.length ? h('div', { class: 'Box' }, h('table', { class: 'Table' }, h('tbody', {}, mine.map(fileRow)))) : null,
    privateDownload,
    rest.length ? h('details', { open: !mine.length }, h('summary', { class: 'small muted' }, `${otherLabel} (${rest.length})`),
      h('div', { class: 'Box' }, h('table', { class: 'Table' }, h('tbody', {}, rest.map(fileRow))))) : null,
    h('p', { class: 'small muted' }, "The SHA-256 is GitHub's, for the file as uploaded."),
  ];
}

function limitedNote(r) {
  if (!r.hasManifest) return ['Not made with letsgo, so there are no audits, provenance or dependencies to show. Versions, downloads and the file check still work.'];
  return [
    "This release was made with letsgo, but this site can't read its manifest, so audits, provenance and dependencies aren't shown. ",
    external('https://github.com/danielriddell21/letsgo-dashboard#run-it', 'Run the dashboard server'), ' for the full view.',
  ];
}

function limitedInstall(p, r) {
  return box({
    title: `Download ${r.tag}`,
    actions: r.url ? external(r.url, h('span', { class: 'small' }, 'Release page')) : null,
    body: h('div', { class: 'Box-body stack' }, h('p', { class: 'small muted' }, limitedNote(r)), filesBody(p, r)),
  });
}

function installSection(p, r) {
  if (r.manifest === undefined) return box({ title: `Install ${r.tag}`, body: h('div', { class: 'Box-body' }, spinner()) });
  if (!r.manifest) return limitedInstall(p, r);
  const tabs = installTabs(p, r);
  const current = tabs.find(t => t[0] === ui.tab) || tabs[0];
  return box({
    title: `Install ${r.tag}`,
    actions: r.url ? external(r.url, h('span', { class: 'small' }, 'Release page')) : null,
    body: h('div', { class: 'Box-body stack' },
      h('div', { class: 'TabNav', role: 'tablist' }, tabs.map(([id, label]) => h('button', { class: 'TabNav-item', role: 'tab', 'data-tab': id, 'aria-selected': String(id === current[0]) }, label))),
      current[2](p, r)),
  });
}

// ---------- changes

function fixedItems(p, from, to) {
  const a = core.lastAudit(from);
  if (a?.status !== 'affected') return [];
  return (a.findings || []).filter(f => {
    const fx = core.fixedIn(p.releases, from, f);
    return fx && core.compareVersions(fx.version, to.version) <= 0;
  }).map(f => ['Fixes ', vulnLink(f.id)]);
}

function changeItems(p, from, to) {
  const c = core.changes(p.releases, from, to, platform());
  const items = fixedItems(p, from, to);
  for (const x of c.api) items.push([x.kind === 'incompatible' ? [labelEl('Breaking', 'danger'), ' '] : null, h('code', {}, x.text), ' ', h('span', { class: 'muted small' }, x.tag)]);
  for (const d of c.deps) items.push([h('code', {}, d.path), ` ${d.from || 'added'} → ${d.to || 'removed'}`]);
  if (c.go) items.push(`Go ${c.go.from} → ${c.go.to}`);
  if (c.size) items.push(`${platform()} download ${core.formatSize(c.size.from)} → ${core.formatSize(c.size.to)}`);
  for (const r of c.retracted) items.push(`Skips retracted ${r.tag}`);
  if (c.missing.length) items.push(h('span', { class: 'muted' }, spinner(), ` reading ${core.plural(c.missing.length, 'more manifest')}`));
  return { items, span: c.span.length };
}

function changesSection(p, from, to) {
  if (!from || !to || core.compareVersions(to.version, from.version) <= 0) return null;
  const title = `Changes from ${from.tag} to ${to.tag}`;
  if (from.manifest === null || to.manifest === null) {
    return box({ title, body: h('div', { class: 'Box-body muted' }, "What changed isn't listed: it needs both releases to have been made with letsgo.") });
  }
  if (!from.manifest || !to.manifest) return box({ title, body: h('div', { class: 'Box-body' }, spinner()) });
  const { items, span } = changeItems(p, from, to);
  const body = items.length
    ? h('ul', { class: 'list' }, items.map(i => h('li', {}, i)))
    : h('span', { class: 'muted' }, 'No recorded changes to the API, dependencies or toolchain.');
  return box({ title, actions: h('span', { class: 'small muted' }, core.plural(span, 'release')), body: h('div', { class: 'Box-body' }, body) });
}

// ---------- provenance

const off = (m, f) => (m.features?.disabled || []).includes(f);

function auditValue(r) {
  if (r.audit === undefined) return spinner();
  const a = core.lastAudit(r);
  if (!a) return stateEl('secondary', 'Not audited since release');
  if (a.status === 'clean') return stateEl('success', `No known vulnerabilities as of ${core.shortDate(a.at)}`);
  return [stateEl('danger', 'Affected'), ' ', (a.findings || []).map(f => [vulnLink(f.id), ' in ', h('code', {}, f.module), ' '])];
}

function scanValue(p, r) {
  if (off(r.manifest, 'vulncheck')) return 'No, turned off by the maintainer';
  const g = core.gate(r, 'vulnerabilities', p.byTag);
  if (g === 'pass') return stateEl('success', 'Passed');
  if (g === 'skip') return stateEl('attention', 'Skipped');
  return h('span', { class: 'muted' }, 'Not recorded');
}

function promotedValue(p, m) {
  const tag = h('code', {}, m.promoted_from.tag);
  const rc = p.byTag[m.promoted_from.tag];
  if (rc?.manifest === undefined) return [tag, ' ', spinner()];
  if (rc.sha256 === m.promoted_from.manifest_sha256) return [tag, ', ', stateEl('success', 'digest matches')];
  return [tag, ', ', stateEl('danger', 'digest does not match')];
}

function apiValue(p, r) {
  const m = r.manifest, api = m.api_changes || [];
  if (off(m, 'api-gate')) return h('span', { class: 'muted' }, 'Not checked');
  if (!api.length) return core.gate(r, 'api compatibility', p.byTag) === 'pass' ? 'None' : null;
  const breaking = api.filter(x => x.kind === 'incompatible').length;
  return [
    breaking ? [labelEl(`${breaking} breaking`, 'danger'), ' '] : null,
    api.length - breaking ? labelEl(`${api.length - breaking} added`) : null,
    h('ul', { class: 'list small' }, api.map(x => h('li', {}, h('code', {}, x.text)))),
  ];
}

function sumdbValue(p, r) {
  if (off(r.manifest, 'sumdb')) return 'Not checked';
  const g = core.gate(r, 'sumdb', p.byTag);
  if (!g) return null;
  return g === 'pass' ? stateEl('success', 'Present') : g;
}

function provenanceRows(p, r) {
  const m = r.manifest;
  const feat = m.features || {};
  const others = (feat.disabled || []).filter(f => !['vulncheck', 'sbom', 'api-gate', 'sumdb'].includes(f));
  const retracted = r.retracted ? [stateEl('danger', r.retracted.reason || 'Withdrawn by the maintainer'), r.retracted.use ? h('span', { class: 'muted' }, ` Use ${r.retracted.use} or later.`) : null] : null;
  return [
    ['Retracted', retracted],
    ['Vulnerability audit', auditValue(r)],
    ['Scanned at release', scanValue(p, r)],
    ['Reproducible build', ['Yes. Check it with ', h('code', {}, `letsgo verify ${r.tag}`)]],
    ['Source archive', m.source ? h('code', {}, m.source.archive) : null],
    ['Promoted from', m.promoted_from ? promotedValue(p, m) : null],
    ['Release plan', m.plan ? `Reviewed ${core.shortDate(m.plan.created_at)} with letsgo ${m.plan.letsgo_version}` : null],
    ['Go checksum database', sumdbValue(p, r)],
    ['API changes', apiValue(p, r)],
    ['SBOM', !off(m, 'sbom') && m.sbom ? h('code', {}, m.sbom) : h('span', { class: 'muted' }, 'Not published')],
    ['Required checks', feat.required?.length ? feat.required.join(', ') : null],
    ['Turned off', others.length ? others.join(', ') : null],
  ].filter(([, v]) => v !== null && v !== undefined);
}

function provenanceSection(p, r) {
  if (!r.manifest) return null;
  const rows = provenanceRows(p, r).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)));
  return box({ title: 'Security and provenance', body: h('table', { class: 'Table kv' }, h('tbody', {}, rows)) });
}

// ---------- dependencies, versions, sidebar

function depsSection(r) {
  const list = r.manifest?.modules?.list || [];
  if (!list.length) return null;
  return box({
    title: 'Dependencies',
    counter: list.length,
    actions: r.manifest.sbom ? h('span', { class: 'small muted' }, 'Full SBOM: ', h('code', {}, r.manifest.sbom)) : null,
    body: table(null, list.map(m => h('tr', {}, h('td', {}, h('code', {}, m.path)), h('td', {}, h('code', {}, m.version))))),
  });
}

function versionRow(p, r, sel, mine) {
  return h('tr', { class: r === sel ? 'clickable selected' : 'clickable', 'data-select': r.tag, 'data-project': p.id },
    h('td', { class: 'mono' }, r.retracted ? h('s', {}, r.tag) : r.tag,
      r === mine ? [' ', labelEl('You use', 'accent')] : null,
      r.prerelease ? [' ', labelEl('Pre-release')] : null),
    h('td', { class: 'nowrap muted' }, core.shortDate(r.published)),
    h('td', {}, statusOf(r)));
}

function versionsSection(p, sel, mine) {
  const all = ui.allVersions || settings.get().prereleases;
  const list = p.releases.filter(r => all || !r.prerelease || r === sel || r === mine);
  const shown = ui.allVersions ? list : list.slice(0, 15);
  return box({
    title: 'Versions',
    counter: p.releases.length,
    actions: h('button', { class: 'btn btn-sm', 'data-action': 'all-versions' }, ui.allVersions ? 'Show fewer' : 'Show all, with pre-releases'),
    body: table(null, shown.map(r => versionRow(p, r, sel, mine))),
  });
}

function detailsSection(p, r) {
  const m = r.manifest;
  if (!m) return null;
  const rows = [
    ['Published', core.shortDate(r.published)],
    ['Commit', githubLink(`${repoPath(p)}/commit/${encodeURIComponent(m.commit)}`, h('code', {}, String(m.commit).slice(0, 7)))],
    ['Go', h('code', {}, String(m.builder.go).replace(/^go/, ''))],
    ['Built by', h('code', {}, m.builder.tool)],
    ['Platforms', [...new Set(core.artifacts(m).map(a => a.platform))].join(', ')],
    ['Modules', m.modules?.count || null],
  ].filter(([, v]) => v !== null);
  return h('div', { class: 'side-section' }, h('h3', {}, `About ${r.tag}`),
    h('table', { class: 'Table kv small' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))))));
}

const HOOK = { ldflags: 'Build-time values', 'archive-layout': 'Archive layout', 'tap-files': 'Homebrew tap files' };

function pluginsSection(r) {
  const plugins = r.manifest?.builder?.plugins || [];
  if (!plugins.length) return null;
  return h('div', { class: 'side-section' }, h('h3', {}, 'Plugins'), plugins.map(x => h('div', {},
    h('code', {}, x.command), ' ', h('span', { class: 'small muted' }, x.version || ''),
    h('div', { class: 'small muted' }, HOOK[x.hook] || x.hook, ' · ', h('code', { title: x.digest }, String(x.digest).slice(7, 19))))));
}

function fingerprintSection(p, r) {
  if (!r.manifest) return null;
  const toggle = h('span', { class: 'SegmentedControl' },
    h('button', { 'data-fp': 'art', 'aria-pressed': String(ui.fp === 'art') }, 'Art'),
    h('button', { 'data-fp': 'words', 'aria-pressed': String(ui.fp === 'words') }, 'Words'));
  const print = ui.fp === 'art' ? h('pre', { class: 'art' }, r.art) : h('div', { class: 'words mono' }, r.words.map(w => h('span', {}, w)));
  return h('div', { class: 'side-section' },
    h('div', { class: 'spread' }, h('h3', {}, 'Fingerprint'), toggle),
    print,
    h('p', { class: 'small muted' }, 'The same as ', h('code', {}, 'letsgo verify'), ' prints for this release.'),
    cmd(`letsgo verify ${r.tag} --repo ${p.owner}/${p.repo}`));
}

// ---------- the page

// prime starts the loads this page needs: audits, and the manifests of the
// chosen release, the viewer's, the target, and every release between.
function prime(p, sel, mine, target) {
  ensureAudits(p);
  for (const r of [sel, mine, target]) ensure(p, r, 'manifest');
  if (sel.manifest?.promoted_from) ensure(p, p.byTag[sel.manifest.promoted_from.tag], 'manifest');
  if (!mine || !target || core.compareVersions(target.version, mine.version) <= 0) return;
  for (const r of p.releases) {
    const between = !r.prerelease && core.compareVersions(r.version, mine.version) > 0 && core.compareVersions(r.version, target.version) <= 0;
    if (between) ensure(p, r, 'manifest');
  }
}

function versionLabel(p, r) {
  if (r === core.latestStable(p.releases)) return `${r.tag} (latest)`;
  if (r.retracted) return `${r.tag} (retracted)`;
  if (r.prerelease) return `${r.tag} (pre-release)`;
  return r.tag;
}

function toolbar(p, sel) {
  const all = ui.allVersions || settings.get().prereleases;
  const options = p.releases.filter(r => all || !r.prerelease || r === sel).map(r => h('option', { value: r.tag, selected: r === sel }, versionLabel(p, r)));
  return h('div', { class: 'row' },
    h('label', { class: 'row' }, h('span', { class: 'muted' }, 'Version'), h('select', { class: 'form-select', id: 'ver', 'data-version': p.id }, options)),
    statusOf(sel),
    h('span', { class: 'grow' }),
    h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'You use'), haveSelect(p, 'have-p')));
}

function verdictFlash(p, mine, v, sel) {
  if (!mine || (v.kind !== 'danger' && v.kind !== 'attention')) return null;
  const action = v.target && v.target !== sel
    ? h('button', { class: 'btn btn-sm', 'data-select': v.target.tag, 'data-project': p.id }, `View ${v.target.tag}`)
    : null;
  return flash(v.kind, v.kind === 'danger' ? 'alert' : 'up', [h('b', {}, v.title), v.text ? ` ${v.text}` : null], action);
}

function sections(p, sel, mine, target) {
  const make = {
    install: () => installSection(p, sel), changes: () => changesSection(p, mine, target), provenance: () => provenanceSection(p, sel),
    dependencies: () => depsSection(sel), versions: () => versionsSection(p, sel, mine), details: () => detailsSection(p, sel),
    plugins: () => pluginsSection(sel), fingerprint: () => fingerprintSection(p, sel),
  };
  const side = new Set(PROJECT_SECTIONS.filter(s => s.side).map(s => s.id));
  const on = settings.get().sections.filter(s => s.on);
  return {
    main: on.filter(s => !side.has(s.id)).map(s => make[s.id]()),
    aside: on.filter(s => side.has(s.id)).map(s => make[s.id]()),
  };
}

function notReady(p) {
  if (p.status === 'error') {
    return flash('danger', 'alert', p.error, h('button', { class: 'btn btn-sm', 'data-action': 'retry', 'data-project': p.id }, 'Retry'));
  }
  if (p.status !== 'ready') return h('p', {}, spinner(), ' Loading releases…');
  if (p.releases.length) return null;
  const scope = p.prefix ? 'module' : 'repository';
  const tagged = p.prefix ? ` tagged ${p.prefix}vX.Y.Z` : '';
  return h('div', { class: 'Box' }, blank('No releases', `This ${scope} has no published releases${tagged}.`));
}

export function projectPage(p) {
  const waiting = notReady(p);
  if (waiting) return [header(p), waiting];
  const mine = have(p), v = core.verdict(p.releases, mine);
  const sel = p.byTag[ui.sel[p.id]] || v.target || p.releases[0];
  prime(p, sel, mine, v.target);
  const { main, aside } = sections(p, sel, mine, v.target);
  return [
    header(p),
    verdictFlash(p, mine, v, sel),
    h('div', { class: 'layout' },
      h('div', { class: 'layout-main' }, toolbar(p, sel), main),
      h('aside', { class: 'layout-side' }, aside)),
  ];
}
