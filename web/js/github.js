// GitHub, through this dashboard's own server: it relays a few read-only
// calls with the viewer's token, because GitHub's release files can't be
// downloaded by a browser directly.

import { cache, token } from './store.js';
import { hex } from './core.js';

export class ApiError extends Error {
  constructor(status, message, rateLimited) { super(message); this.status = status; this.rateLimited = rateLimited; }
}

const MINUTE = 60 * 1000;

async function request(path, raw) {
  const headers = {};
  const t = token.get();
  if (t) headers.Authorization = 'Bearer ' + t;
  let res;
  try { res = await fetch('/api/gh' + path, { headers, cache: 'no-store' }); }
  catch { throw new ApiError(0, 'GitHub could not be reached.'); }
  if (!res.ok) {
    const limited = (res.status === 403 || res.status === 429) && res.headers.get('X-RateLimit-Remaining') === '0';
    let message = '';
    try { message = (await res.json()).message || ''; } catch { /* not JSON */ }
    throw new ApiError(res.status, limited ? 'GitHub rate limit reached. Sign in to get a higher limit.' : message || `GitHub answered ${res.status}.`, limited);
  }
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

async function cached(key, maxAge, load) {
  const hit = cache.get(key, maxAge);
  if (hit !== undefined) return hit;
  const v = await load();
  cache.put(key, v);
  return v;
}

export const github = {
  user: () => request('/user'),
  repo: (o, r) => cached(`repo:${o}/${r}`, 60 * MINUTE, () => request(`/repos/${o}/${r}`).then(x => ({
    private: x.private, description: x.description || '', avatar: x.owner && x.owner.avatar_url, url: x.html_url,
  }))),

  // releases lists up to 300 releases, newest first, keeping only what the
  // dashboard reads.
  releases: (o, r, fresh) => {
    const load = async () => {
      const all = [];
      for (let page = 1; page <= 3; page++) {
        const batch = await request(`/repos/${o}/${r}/releases?per_page=100&page=${page}`);
        all.push(...batch.map(x => ({
          tag: x.tag_name, draft: x.draft, url: x.html_url, published: x.published_at, body: (x.body || '').slice(0, 2000),
          assets: Object.fromEntries((x.assets || []).map(a => [a.name, a.id])),
        })));
        if (batch.length < 100) break;
      }
      return all;
    };
    if (fresh) return load().then(v => { cache.put(`rel:${o}/${r}`, v); return v; });
    return cached(`rel:${o}/${r}`, 10 * MINUTE, load);
  },

  // asset downloads a release file as text, with the SHA-256 of its exact
  // bytes: that digest is what identifies a manifest.
  asset: (o, r, id) => cached(`asset:${o}/${r}:${id}`, 0, async () => {
    const bytes = await request(`/repos/${o}/${r}/releases/assets/${id}`, true);
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { text: new TextDecoder().decode(bytes), sha256: hex(sum) };
  }),

  ownerRepos: async o => {
    try { return await request(`/orgs/${o}/repos?per_page=100&sort=updated`); }
    catch (e) { if (e.status === 404) return request(`/users/${o}/repos?per_page=100&sort=updated`); throw e; }
  },
  myRepos: () => request('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'),
};
