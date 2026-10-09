// What the page knows for this visit: the deployment's configuration, who is
// signed in, and transient choices. Nothing here is stored.

export const session = {
  config: { mode: 'server', oauth: false, client_id: '', web: 'https://github.com', defaults: [], version: '', generated: '' },
  user: null,
};

export const ui = {
  sel: {}, tab: 'download', fp: 'art', allVersions: false, dep: 'golang.org/x/', check: null,
  addOwner: '', ownerRepos: null, ownerError: '', notice: '', draft: null,
  search: { q: '', status: 'idle', results: [], error: '' },
};

export const isStatic = () => session.config.mode === 'static';

let renderer = () => {};
let scheduled = false;

// onRender sets what schedule calls.
export function onRender(fn) { renderer = fn; }

// schedule re-renders on the next frame, once however often it's asked.
export function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderer();
  });
}
