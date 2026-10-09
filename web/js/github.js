// GitHub, through this dashboard's own server: it relays a few read-only
// calls with the viewer's token, because GitHub's release files can't be
// downloaded by a browser directly.
//
// On a static site (GitHub Pages) there is no server. A repository the build
// fetched is read from data/, written beside the page by
// `letsgo-dashboard snapshot`; paths are relative, so the site can live under
// a subpath. Any other public repository is read from api.github.com directly,
// which answers browsers, except for release files, which it doesn't: those
// need the server, so such a repository shows its releases and downloads only.
//
// Responses are kept in memory for the visit. Between visits the browser's
// own HTTP cache does the work: the server marks release files, which never
// change for a given ID, as cacheable.

import { token } from './store.js';
import { hex, pathSegment, assetID } from './core.js';

export class ApiError extends Error {
  constructor(status, message, rateLimited) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

let staticSite = false;
let snapshot = new Set();
// useStaticData switches the page to a static site. specs are the projects
// its build fetched, as owner/name or owner/name@prefix/: only those can be
// read from data/.
export function useStaticData(on, specs = []) {
  staticSite = on;
  snapshot = new Set(specs.map(s => s.split('@')[0].toLowerCase()));
}

const memory = new Map();
// once runs load for a key once per visit, sharing the answer.
function once(key, load) {
  if (!memory.has(key)) {
    const p = load();
    memory.set(key, p);
    p.catch(() => memory.delete(key));
  }
  return memory.get(key);
}
export function forget() { memory.clear(); }

async function errorFrom(res) {
  const limited = (res.status === 403 || res.status === 429) && res.headers.get('X-RateLimit-Remaining') === '0';
  if (limited) {
    const how = staticSite ? 'Try again later, or run your own dashboard.' : 'Sign in to get a higher limit.';
    return new ApiError(res.status, `GitHub's rate limit was reached. ${how}`, true);
  }
  let message = '';
  try {
    message = (await res.json()).message || '';
  } catch {
    // Not JSON.
  }
  return new ApiError(res.status, message || `GitHub answered ${res.status}.`, false);
}

const LIVE = 'https://api.github.com';

// request reads GitHub: through the server, or straight from the API on a
// static site, where nobody is signed in.
async function request(path, raw) {
  const headers = {};
  const t = staticSite ? '' : token.get();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (staticSite) headers.Accept = 'application/vnd.github+json';
  let res;
  try {
    res = await fetch((staticSite ? LIVE : 'api/gh') + path, { headers });
  } catch {
    throw new ApiError(0, 'GitHub could not be reached.');
  }
  if (!res.ok) throw await errorFrom(res);
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

async function file(path, raw) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-cache' });
  } catch {
    throw new ApiError(0, 'The site could not be reached.');
  }
  if (res.status === 404) throw new ApiError(404, "This project isn't on this site.");
  if (!res.ok) throw new ApiError(res.status, `The site answered ${res.status}.`);
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

const unavailable = () => Promise.reject(new ApiError(0, 'Not available on this site.'));

function trimRelease(x) {
  return {
    tag: x.tag_name, draft: x.draft, url: x.html_url, published: x.published_at, body: (x.body || '').slice(0, 2000),
    assets: Object.fromEntries((x.assets || []).map(a => [a.name, a.id])),
    files: (x.assets || []).map(a => ({ name: a.name, size: a.size, digest: a.digest || '', url: a.browser_download_url })),
  };
}

// repoPath is "owner/name" for a URL, or throws ApiError for names GitHub
// could not have.
function repoPath(o, r) {
  try {
    return `${pathSegment(o)}/${pathSegment(r)}`;
  } catch (e) {
    throw new ApiError(400, e.message);
  }
}

// snapshotted says whether a static site carries a repository's data.
const snapshotted = repo => staticSite && snapshot.has(repo.toLowerCase());

async function listReleases(o, r) {
  const repo = repoPath(o, r);
  if (snapshotted(repo)) return file(`data/${repo}/releases.json`);
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await request(`/repos/${repo}/releases?per_page=100&page=${page}`);
    all.push(...batch.map(trimRelease));
    if (batch.length < 100) break;
  }
  return all;
}

async function readRepo(o, r) {
  const repo = repoPath(o, r);
  if (snapshotted(repo)) return file(`data/${repo}/repo.json`);
  const x = await request(`/repos/${repo}`);
  return { private: x.private, description: x.description || '', avatar: x.owner?.avatar_url, url: x.html_url };
}

async function readAsset(o, r, id) {
  const repo = repoPath(o, r), asset = assetID(id);
  let bytes;
  if (!staticSite) bytes = await request(`/repos/${repo}/releases/assets/${asset}`, true);
  else if (snapshotted(repo)) bytes = await file(`data/${repo}/assets/${asset}`, true);
  else throw new ApiError(0, 'This site cannot read release files for a repository it was not built with; run the dashboard server for the full view.');
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { text: new TextDecoder().decode(bytes), sha256: hex(sum) };
}

async function ownerRepos(o) {
  if (staticSite) return unavailable();
  let owner;
  try {
    owner = pathSegment(o);
  } catch (e) {
    throw new ApiError(400, e.message);
  }
  try {
    return await request(`/orgs/${owner}/repos?per_page=100&sort=updated`);
  } catch (e) {
    if (e.status !== 404) throw e;
    return request(`/users/${owner}/repos?per_page=100&sort=updated`);
  }
}

// searchRepos finds public repositories, best match first.
async function searchRepos(q) {
  const query = new URLSearchParams({ q: q.slice(0, 120), per_page: '10' });
  const found = await request(`/search/repositories?${query}`);
  return (found.items || []).map(x => ({
    full_name: x.full_name, description: x.description || '', stars: x.stargazers_count, language: x.language || '',
    avatar: x.owner?.avatar_url, private: x.private, archived: x.archived,
  }));
}

export const github = {
  user: () => (staticSite ? unavailable() : request('/user')),
  repo: (o, r) => once(`repo:${o}/${r}`, () => readRepo(o, r)),
  // releases lists up to 300 releases, newest first, keeping only what the
  // dashboard reads.
  releases: (o, r, fresh) => {
    if (fresh) memory.delete(`rel:${o}/${r}`);
    return once(`rel:${o}/${r}`, () => listReleases(o, r));
  },
  // asset downloads a release file as text, with the SHA-256 of its exact
  // bytes: that digest is what identifies a manifest.
  asset: (o, r, id) => once(`asset:${o}/${r}:${id}`, () => readAsset(o, r, id)),
  search: searchRepos,
  ownerRepos,
  myRepos: () => (staticSite ? unavailable() : request('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member')),
};
