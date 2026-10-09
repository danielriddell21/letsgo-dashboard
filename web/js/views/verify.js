// Verify a file: hash it in the browser and look the digest up in every
// manifest and release file of every pinned project.

import * as core from '../core.js';
import { h } from '../dom.js';
import { ui, schedule } from '../state.js';
import { watched, project, ensure } from '../projects.js';
import { box, flash, pageHead, spinner, statusOf, releaseLink } from '../ui.js';

// findDigest reports what a SHA-256 is: { state: 'found', p, r, d },
// { state: 'loading' } while manifests are still arriving, or
// { state: 'unknown' }.
export function findDigest(hash) {
  let loading = false;
  for (const spec of watched()) {
    const p = project(spec);
    if (p.status === 'loading' || p.status === 'idle') {
      loading = true;
      continue;
    }
    for (const r of p.releases) {
      if (r.manifest === undefined) {
        ensure(p, r, 'manifest');
        loading = true;
        continue;
      }
      const d = matchIn(r, hash);
      if (d) return { state: 'found', p, r, d };
    }
  }
  return { state: loading ? 'loading' : 'unknown' };
}

function matchIn(r, hash) {
  if (r.manifest && r.sha256 === hash) return { what: 'manifest', file: 'letsgo.json' };
  const fromManifest = r.manifest ? core.digests(r.manifest) : [];
  return [...fromManifest, ...core.fileDigests(r.files)].find(x => x.sha256 === hash) || null;
}

function found({ p, r, d }, hash) {
  const bad = core.status(r).kind === 'danger';
  return flash(bad ? 'attention' : 'success', bad ? 'alert' : 'check', [
    h('b', {}, `Published by ${p.id} in ${r.tag}`),
    h('div', {}, `${d.what}: `, h('code', {}, d.file)),
    h('div', {}, statusOf(r)),
    h('div', { class: 'hash' }, hash),
  ], releaseLink(p, r.tag, h('span', { class: 'btn btn-sm' }, 'View release')));
}

function result() {
  const c = ui.check;
  if (!c) return null;
  if (c.busy) return h('div', { class: 'flash accent' }, spinner(), h('span', {}, c.busy));
  if (c.error) return flash('attention', 'alert', c.error);
  const match = findDigest(c.hash);
  if (match.state === 'loading') return h('div', { class: 'flash accent' }, spinner(), h('span', {}, "Reading every release's manifest…"));
  if (match.state === 'found') return found(match, c.hash);
  const subject = c.name ? `${c.name} does` : 'This hash does';
  return flash('danger', 'alert', [h('b', {}, 'Not recognised. '), `${subject} not match any release of a pinned project. Don't run it.`, h('div', { class: 'hash' }, c.hash)]);
}

export function verifyModule(full) {
  const b = box({
    title: 'Verify a file',
    body: h('div', { class: 'Box-body stack' },
      h('div', { class: 'drop', id: 'drop', tabindex: '0', role: 'button', 'data-action': 'pick-file' },
        h('b', {}, 'Drop a downloaded file here, or click to choose'),
        h('span', { class: 'small muted' }, "An archive, executable, source archive or container digest. It's hashed in your browser; nothing is uploaded.")),
      h('form', { class: 'input-group', 'data-form': 'hash' },
        h('input', { class: 'form-control mono', id: 'hash-in', type: 'text', placeholder: 'Or paste a SHA-256', 'aria-label': 'SHA-256', autocomplete: 'off' }),
        h('button', { class: 'btn', type: 'submit' }, 'Verify')),
      result()),
  });
  if (!full) return b;
  return h('div', { class: 'narrow' }, pageHead('Verify a file', 'Check that a file you downloaded is one a pinned project published, and whether that release is still safe to use.'), b);
}

export async function hashFile(f) {
  ui.check = { busy: `Hashing ${f.name}…` };
  schedule();
  try {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()));
    ui.check = { hash: core.hex(sum), name: f.name };
  } catch {
    ui.check = { error: "The file couldn't be read. Paste its SHA-256 instead: shasum -a 256 <file>" };
  }
  schedule();
}

export function checkHash(input) {
  const hash = input.trim().toLowerCase().replace(/^sha256:/, '');
  ui.check = /^[0-9a-f]{64}$/.test(hash) ? { hash } : { error: 'A SHA-256 is 64 hexadecimal characters. Get one with: shasum -a 256 <file>' };
  schedule();
}
