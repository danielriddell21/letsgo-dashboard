// Search GitHub for a public repository and pin it.

import * as core from '../core.js';
import { h, icon } from '../dom.js';
import { ui } from '../state.js';
import { watched } from '../projects.js';
import { box, flash, spinner, pinButton, labelEl } from '../ui.js';

function compact(n) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

function row({ id, avatar, description, stars, language, archived, hint }, isPinned) {
  const meta = [
    stars === undefined ? null : h('span', { class: 'result-meta' }, icon('star'), compact(stars)),
    language ? h('span', {}, language) : null,
    hint ? h('span', {}, hint) : null,
  ].filter(Boolean);
  return h('div', { class: 'Box-row' },
    avatar ? h('img', { class: 'avatar avatar-md', src: avatar, alt: '' }) : null,
    h('div', { class: 'Box-row-grow' },
      h('a', { href: `#/p/${encodeURIComponent(id)}` }, h('b', {}, id)), archived ? [' ', labelEl('Archived')] : null,
      description ? h('div', { class: 'small muted' }, description) : null,
      meta.length ? h('div', { class: 'small muted result-line' }, meta) : null),
    pinButton(id, isPinned));
}

function results() {
  const { q, status, results: found, error } = ui.search;
  const text = q.trim();
  const pinned = new Set(watched().map(s => s.id));
  const exact = core.parseSpec(text);
  const rows = [];
  if (exact) rows.push(row({ id: exact.id, hint: exact.prefix ? 'A module of a monorepo' : 'Pin by name' }, pinned.has(exact.id)));
  for (const r of found) {
    if (r.full_name.toLowerCase() !== exact?.id.toLowerCase()) rows.push(row({ id: r.full_name, avatar: r.avatar, description: r.description, stars: r.stars, language: r.language, archived: r.archived }, pinned.has(r.full_name)));
  }
  if (rows.length) return h('div', { class: 'Box-scroll' }, rows);
  if (status === 'loading') return h('div', { class: 'Box-row muted' }, spinner(), ' Searching…');
  if (status === 'error') return h('div', { class: 'Box-body' }, flash('danger', 'alert', error));
  if (status === 'done') return h('div', { class: 'Box-row muted' }, `No repositories match "${text}".`);
  return null;
}

export function searchModule() {
  return box({
    title: 'Search and pin',
    body: [
      h('form', { class: 'Box-body stack', 'data-form': 'search', role: 'search' },
        h('div', { class: 'search-field' },
          icon('search'),
          h('input', {
            class: 'form-control', id: 'repo-search', type: 'search', value: ui.search.q, autocomplete: 'off', spellcheck: 'false',
            placeholder: 'Search GitHub repositories, or type owner/repo', 'aria-label': 'Search GitHub repositories', 'data-input': 'search',
          })),
        ui.search.q ? null : h('p', { class: 'small muted' }, 'Pin any public repository. Ones released with letsgo show audits, provenance and dependencies and sit at the top; the rest show releases and downloads.')),
      results(),
    ],
  });
}
