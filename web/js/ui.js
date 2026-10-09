// Pieces the pages share.

import * as core from './core.js';
import { h, icon } from './dom.js';
import { settings } from './store.js';

const STATE_ICON = { success: 'check', danger: 'alert', attention: 'up', secondary: 'dot' };

export const stateEl = (kind, label) => h('span', { class: `state ${kind}` }, icon(STATE_ICON[kind] || 'dot'), label);

export function statusOf(r) {
  const s = core.status(r);
  if (s.label === 'Vulnerable') return stateEl('danger', `Vulnerable (${s.ids.join(', ')})`);
  if (s.label === 'No known issues') return stateEl('success', `No known issues · ${s.at}`);
  return stateEl(s.kind, s.label);
}

export function verdictState(v) {
  if (v.kind === 'success') return stateEl('success', 'Up to date');
  if (v.kind === 'attention') return stateEl('attention', v.title);
  return stateEl('danger', v.title);
}

export const spinner = () => h('span', { class: 'spinner', 'aria-label': 'Loading' });

export const copyButton = (text, label = 'Copy') => h('button', { class: 'btn-octicon', 'data-copy': text, 'aria-label': label }, icon('copy'));

export const cmd = text => h('div', { class: 'cmd' }, h('code', {}, text), copyButton(text));

export const external = (href, ...children) => h('a', { href, target: '_blank', rel: 'noopener' }, ...children);

export const githubLink = (path, ...children) => external(`https://github.com/${path}`, ...children);

export const vulnLink = id => external(`https://pkg.go.dev/vuln/${encodeURIComponent(id)}`, id);

export const projectHref = p => `#/p/${encodeURIComponent(p.id)}`;

// releaseLink opens a project at one release.
export const releaseLink = (p, tag, ...children) => h('a', { href: projectHref(p), 'data-select': tag, 'data-project': p.id }, ...children);

export const labelEl = (text, variant) => h('span', { class: variant ? `Label Label--${variant}` : 'Label' }, text);

export const youUse = (p, r) => (settings.get().have[p.id] === r.tag ? [' ', labelEl('You use', 'accent')] : null);

export function projectName(p) {
  return [p.owner, '/', h('b', {}, p.repo), p.prefix ? [' ', labelEl(p.prefix)] : null];
}

export function box({ title, counter, actions, body, footer }) {
  return h('div', { class: 'Box' },
    h('div', { class: 'Box-header' },
      h('span', { class: 'Box-title' }, title, counter === undefined ? null : [' ', h('span', { class: 'Counter' }, counter)]),
      actions),
    body,
    footer ? h('div', { class: 'Box-footer small muted' }, footer) : null);
}

export const table = (head, rows) => h('div', { class: 'Box-scroll' },
  h('table', { class: 'Table' }, head ? h('thead', {}, h('tr', {}, head.map(c => h('th', {}, c)))) : null, h('tbody', {}, rows)));

export const flash = (kind, iconName, body, action) => h('div', { class: `flash ${kind}` }, icon(iconName), h('div', { class: 'flash-grow' }, body), action);

export const blank = (title, ...text) => h('div', { class: 'blankslate' }, h('h2', {}, title), h('p', {}, ...text));

export const pageHead = (title, ...intro) => [
  h('div', { class: 'Subhead' }, h('h1', { class: 'Subhead-heading' }, title)),
  intro.length ? h('p', { class: 'muted' }, ...intro) : null,
];

function releaseOption(r, mine) {
  const suffix = r.retracted ? ' (retracted)' : '';
  return h('option', { value: r.tag, selected: r.tag === mine }, r.tag + suffix);
}

// haveSelect picks the version of a project the viewer runs.
export function haveSelect(p, id) {
  const mine = settings.get().have[p.id] || '';
  const options = p.releases.filter(r => !r.prerelease || r.tag === mine).map(r => releaseOption(r, mine));
  return h('select', { class: 'form-select', id, 'data-have': p.id, 'aria-label': 'Version you use' },
    h('option', { value: '' }, 'Not installed'), options);
}
