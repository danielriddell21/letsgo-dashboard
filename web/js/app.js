// The dashboard: rendering the page for the current route, and booting.
// What the viewer sets up is kept in localStorage (see store.js); the server
// keeps nothing.

import * as core from './core.js';
import { h, mount } from './dom.js';
import { settings, token } from './store.js';
import { useStaticData } from './github.js';
import { session, isStatic, route, onRender } from './state.js';
import { project } from './projects.js';
import { oauthReturn, restoreUser } from './auth.js';
import { listen } from './events.js';
import { external } from './ui.js';
import { overviewPage, advisoriesModule, dependenciesModule } from './views/overview.js';
import { projectPage } from './views/project.js';
import { verifyModule } from './views/verify.js';
import { addPage, signInPage, settingsPage, notFound } from './views/pages.js';

const $ = sel => document.querySelector(sel);

// ---------- theme

const darkScheme = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const { theme } = settings.get();
  let resolved = theme;
  if (theme === 'auto') resolved = darkScheme.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
}

// ---------- rendering

const PAGES = {
  overview: overviewPage,
  advisories: () => advisoriesModule(true),
  dependencies: () => dependenciesModule(true),
  verify: () => verifyModule(true),
  settings: settingsPage,
  add: addPage,
  signin: signInPage,
};

function viewFor(r) {
  if (r.name !== 'project') return (PAGES[r.name] || notFound)();
  const spec = core.parseSpec(r.id);
  return spec ? projectPage(project(spec)) : notFound();
}

const signOutButton = () => h('button', { class: 'btn btn-sm', 'data-action': 'signout' }, 'Sign out');

function renderAccount() {
  const account = $('#account');
  if (isStatic()) {
    mount(account, h('span', { class: 'Label' }, 'Public projects'));
  } else if (session.user) {
    mount(account,
      h('img', { class: 'avatar avatar-sm', src: session.user.avatar_url, alt: '' }),
      h('span', { class: 'small' }, session.user.login),
      signOutButton());
  } else if (token.get()) {
    mount(account, h('span', { class: 'small muted' }, 'Signed in with a token'), signOutButton());
  } else {
    mount(account, h('a', { class: 'btn btn-sm', href: '#/signin' }, 'Sign in'));
  }
}

function renderFooter() {
  const kept = isStatic()
    ? `Release data as of ${core.shortDate(session.config.generated)}. Your settings are kept in this browser only.`
    : 'Your settings and token are kept in this browser only.';
  mount($('#footer'),
    h('span', {}, `letsgo dashboard ${session.config.version}`),
    h('span', {}, kept),
    h('a', { href: '#/settings' }, 'Settings'),
    external('https://github.com/danielriddell21/letsgo-dashboard', 'Run your own'));
}

function renderNav(r) {
  const current = r.name === 'overview' ? '' : r.name;
  for (const a of document.querySelectorAll('#nav a')) {
    a.setAttribute('aria-current', a.dataset.route === current ? 'page' : 'false');
  }
}

// Releases arrive while someone is typing, and each one re-renders the page.
// The fields below keep what was typed, and focus and the cursor stay put.
const TYPED = ['hash-in', 'owner-in', 'token-in'];
const TEXT_FIELD = 'input[type=text], input[type=search], input[type=password], textarea';

function captureInputs() {
  const el = document.activeElement;
  return {
    focus: el?.id ? { id: el.id, caret: el.selectionStart } : null,
    typed: TYPED.map(id => [id, document.getElementById(id)?.value]).filter(([, v]) => v),
  };
}

function restoreInputs({ focus, typed }) {
  for (const [id, value] of typed) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = value;
  }
  const el = focus && document.getElementById(focus.id);
  if (!el?.matches(TEXT_FIELD)) return;
  el.focus();
  try {
    el.setSelectionRange(focus.caret, focus.caret);
  } catch {
    // Not a text field.
  }
}

function render() {
  applyTheme();
  const r = route();
  renderNav(r);
  renderAccount();
  renderFooter();
  const inputs = captureInputs();
  mount($('#view'), viewFor(r));
  document.title = r.name === 'project' ? `${r.id} · letsgo dashboard` : 'letsgo dashboard';
  restoreInputs(inputs);
}

// ---------- boot

async function readConfig() {
  try {
    const res = await fetch('api/config', { cache: 'no-cache' });
    Object.assign(session.config, await res.json());
  } catch {
    // Keep the defaults: a server with no sign-in and no preset projects.
  }
}

darkScheme.addEventListener('change', applyTheme);
onRender(render);
listen();

applyTheme();
await readConfig();
useStaticData(isStatic(), session.config.defaults);
await oauthReturn();
await restoreUser();
render();
