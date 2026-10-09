// Adding a project, signing in, and settings.

import { h, icon } from '../dom.js';
import { settings, token, OVERVIEW_MODULES, PROJECT_SECTIONS } from '../store.js';
import { session, ui, isStatic } from '../state.js';
import { watched } from '../projects.js';
import { flash, blank, pageHead, spinner, external, projectHref, pinButton } from '../ui.js';
import { searchModule } from './search.js';
import { PLATFORMS, platform } from './project.js';

export const notFound = () => blank('Page not found', h('a', { href: '#/' }, 'Back to the overview'));

const notice = () => (ui.notice ? flash('attention', 'alert', ui.notice) : null);

function watchRow(id, description, isPrivate) {
  return h('div', { class: 'Box-row' },
    h('div', { class: 'Box-row-grow' }, h('a', { href: `#/p/${encodeURIComponent(id)}` }, h('b', {}, id)), isPrivate ? [' ', h('span', { class: 'Label' }, 'Private')] : null,
      description ? h('div', { class: 'small muted' }, description) : null),
    pinButton(id, watched().some(s => s.id === id)));
}

function repoList() {
  const repos = ui.ownerRepos;
  if (repos === 'loading') return spinner();
  if (!repos) return null;
  if (!repos.length) return h('div', { class: 'Box' }, h('div', { class: 'Box-row muted' }, 'No repositories.'));
  return h('div', { class: 'Box' }, repos.map(r => watchRow(r.full_name, r.description, r.private)));
}

function ownerForm() {
  if (isStatic()) return null;
  return [
    h('form', { class: 'stack', 'data-form': 'owner' },
      h('label', { class: 'form-label', for: 'owner-in' }, "Browse an owner's repositories"),
      h('div', { class: 'input-group' },
        h('input', { class: 'form-control mono', id: 'owner-in', type: 'text', value: ui.addOwner, placeholder: 'owner or organisation', autocomplete: 'off' }),
        h('button', { class: 'btn', type: 'submit' }, 'List')),
      session.user ? h('p', { class: 'small' }, h('button', { class: 'btn btn-sm', type: 'button', 'data-action': 'my-repos' }, 'List repositories I can read')) : null),
    ui.ownerError ? flash('danger', 'alert', ui.ownerError) : null,
    repoList(),
  ];
}

export function addPage() {
  return h('div', { class: 'narrow' }, pageHead('Pin a project'), notice(), searchModule(), ownerForm());
}

export function signInPage() {
  if (isStatic()) return blank('No sign-in here', 'This site shows public projects only.');
  return h('div', { class: 'narrow' },
    pageHead('Sign in', 'Public projects work without signing in. Sign in to see private repositories you have access to, and for a higher GitHub rate limit.'),
    ui.notice ? flash('danger', 'alert', ui.notice) : null,
    session.config.oauth ? [h('div', {}, h('button', { class: 'btn btn-primary', 'data-action': 'oauth' }, 'Sign in with GitHub')), h('p', { class: 'small muted' }, '— or use a token —')] : null,
    h('form', { class: 'stack', 'data-form': 'token' },
      h('label', { class: 'form-label', for: 'token-in' }, 'GitHub token'),
      h('div', { class: 'input-group' },
        h('input', { class: 'form-control mono', id: 'token-in', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste a token' }),
        h('button', { class: 'btn', type: 'submit' }, 'Sign in'))),
    h('p', { class: 'small muted' }, 'With the GitHub CLI, run ', h('code', {}, 'gh auth token'), ' and paste the result. Or ',
      external('https://github.com/settings/personal-access-tokens/new', 'create a fine-grained token'), ' with read access to Contents and Metadata.'),
    h('p', { class: 'small muted' }, "The token is kept in this browser's local storage and sent only to this dashboard's server, which passes it to GitHub and keeps nothing. Sign out removes it."));
}

// ---------- settings

const THEMES = [['auto', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['dark_dimmed', 'Dark dimmed']];

function moveButton(kind, id, dir, disabled) {
  return h('button', { class: 'btn-octicon', 'data-move': kind, 'data-id': id, 'data-dir': String(dir), 'aria-label': dir < 0 ? 'Move up' : 'Move down', disabled },
    icon(dir < 0 ? 'arrowUp' : 'arrowDown'));
}

function moduleList(list, known, kind) {
  return h('div', { class: 'Box module-list' }, list.map((m, i) => {
    const k = known.find(x => x.id === m.id);
    return h('div', { class: 'Box-row' },
      h('label', { class: 'checkbox Box-row-grow' },
        h('input', { type: 'checkbox', 'data-toggle': kind, 'data-id': m.id, checked: m.on }),
        k.title, k.side ? [' ', h('span', { class: 'small muted' }, 'sidebar')] : null),
      moveButton(kind, m.id, -1, i === 0),
      moveButton(kind, m.id, 1, i === list.length - 1));
  }));
}

const section = (title, ...children) => h('div', { class: 'stack' }, h('h2', {}, title), children);

function appearance(s) {
  return [
    section('Theme', h('div', { class: 'SegmentedControl', role: 'group', 'aria-label': 'Theme' },
      THEMES.map(([v, l]) => h('button', { 'data-set-theme': v, 'aria-pressed': String(s.theme === v) }, l)))),
    section('Platform',
      h('p', { class: 'small muted' }, 'Download links and sizes are shown for this platform.'),
      h('select', { class: 'form-select', id: 'plat-setting', 'data-platform': '', 'aria-label': 'Platform' },
        h('option', { value: '' }, `Detect (${platform()})`),
        PLATFORMS.map(x => h('option', { selected: s.platform === x }, x))),
      h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', 'data-pref': 'prereleases', checked: s.prereleases }), ' Show pre-releases in version lists')),
  ];
}

function watchedSection() {
  const rows = watched().map(sp => h('div', { class: 'Box-row' },
    h('a', { class: 'Box-row-grow mono', href: projectHref(sp) }, sp.id),
    h('button', { class: 'btn btn-sm', 'data-action': 'unwatch', 'data-project': sp.id }, 'Remove')));
  return section('Pinned projects',
    h('div', { class: 'Box' }, rows.length ? rows : h('div', { class: 'Box-row muted' }, 'None yet.')),
    h('div', {}, h('a', { class: 'btn btn-sm', href: '#/add' }, icon('plus'), 'Pin a project')));
}

function shareSection() {
  return section('Share your setup',
    h('p', { class: 'small muted' }, 'Your pinned projects and layout, without your token. Paste it into another browser to set it up the same way.'),
    h('textarea', { class: 'form-control mono', id: 'settings-json', rows: '6', 'aria-label': 'Settings', 'data-input': 'draft' }, ui.draft ?? settings.export()),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-sm', 'data-copy-from': 'settings-json' }, 'Copy'),
      h('button', { class: 'btn btn-sm', 'data-action': 'import' }, "Import what's in the box")),
    notice());
}

function storageSection() {
  const what = token.get() ? 'your settings and your token' : 'your settings';
  return section('Stored in this browser',
    h('p', { class: 'small muted' }, `The dashboard keeps nothing on its server. In this browser it keeps ${what}.`),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-sm btn-danger', 'data-action': 'forget' }, 'Remove everything')));
}

export function settingsPage() {
  const s = settings.get();
  return h('div', { class: 'narrow' },
    pageHead('Settings'),
    appearance(s),
    section('Overview', h('p', { class: 'small muted' }, 'Choose the modules on the overview, and their order.'), moduleList(s.overview, OVERVIEW_MODULES, 'overview')),
    section('Project page', moduleList(s.sections, PROJECT_SECTIONS, 'sections')),
    watchedSection(),
    shareSection(),
    storageSection());
}
