// Signing in and out: with a pasted token, or with GitHub's OAuth flow and
// PKCE, finished by this dashboard's server, which swaps the code for a token.

import { token, forgetEverything } from './store.js';
import { github, forget } from './github.js';
import { session, ui, isStatic, schedule } from './state.js';
import { forgetProjects } from './projects.js';

const OAUTH_KEY = 'lgd:oauth';

// resetData drops everything loaded with the previous token.
function resetData() {
  forget();
  forgetProjects();
}

export async function signIn(t) {
  try {
    token.set(t);
    session.user = await github.user();
    resetData();
    ui.notice = '';
    location.hash = '#/';
  } catch (e) {
    token.clear();
    session.user = null;
    ui.notice = e.status === 401 ? 'GitHub did not accept that token. It may have expired.' : e.message;
  }
  schedule();
}

export function signOut() {
  token.clear();
  session.user = null;
  resetData();
  location.hash = '#/';
}

// forgetAll signs out and removes everything stored in this browser.
export function forgetAll() {
  forgetEverything();
  signOut();
}

// restoreUser looks up who a stored token belongs to, dropping it if GitHub
// no longer accepts it.
export async function restoreUser() {
  if (!token.get() || isStatic()) return;
  try {
    session.user = await github.user();
  } catch (e) {
    if (e.status !== 401) return;
    token.clear();
    ui.notice = 'Your sign-in expired. Sign in again.';
  }
}

// ---------- OAuth

function trimPadding(s) {
  let out = s;
  while (out.endsWith('=')) out = out.slice(0, -1);
  return out;
}
const b64url = bytes => trimPadding(btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_'));
const randomString = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectURI = () => location.origin + location.pathname;

export async function oauthStart() {
  const verifier = randomString(32), state = randomString(16);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ state, verifier }));
  const query = new URLSearchParams({
    client_id: session.config.client_id, redirect_uri: redirectURI(), state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  location.assign(`${session.config.web}/login/oauth/authorize?${query}`);
}

function takeSavedOAuth() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(OAUTH_KEY) || 'null');
    sessionStorage.removeItem(OAUTH_KEY);
    return saved;
  } catch {
    return null;
  }
}

async function exchange(code, verifier) {
  const res = await fetch('api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectURI() }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(j.message || 'no token');
  return j.access_token;
}

// oauthReturn finishes a sign-in when GitHub sends the viewer back here.
export async function oauthReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  const saved = takeSavedOAuth();
  history.replaceState(null, '', location.pathname + '#/signin');
  if (q.has('error')) {
    ui.notice = 'GitHub sign-in was cancelled.';
  } else if (saved?.state === q.get('state')) {
    try {
      await signIn(await exchange(q.get('code'), saved.verifier));
    } catch (e) {
      ui.notice = `Sign-in with GitHub did not finish: ${e.message}`;
    }
  } else {
    ui.notice = 'Sign-in could not be confirmed. Try again.';
  }
}
