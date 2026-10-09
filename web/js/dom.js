// Building the page from DOM nodes rather than HTML strings: text goes in as
// text nodes and attributes through setAttribute, so nothing a release
// carries (a tag, a reason, a description) can become markup.

const SVG = 'http://www.w3.org/2000/svg';

// safeURL lets through in-page links and https URLs, and nothing else.
export function safeURL(url) {
  const s = String(url ?? '');
  if (s.startsWith('#') || s.startsWith('https://')) return s;
  return '#';
}

function setAttribute(el, name, value) {
  if (value === false || value === null || value === undefined) return;
  if (name === 'class') {
    el.className = value;
  } else if (name === 'href' || name === 'src') {
    el.setAttribute(name, safeURL(value));
  } else {
    el.setAttribute(name, value === true ? '' : String(value));
  }
}

// append adds children: nodes as they are, anything else as text. Arrays are
// flattened, and null, undefined, false and '' are skipped.
export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// h makes an element: h('a', { href: '#/' }, 'Overview').
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) setAttribute(el, name, value);
  return append(el, children);
}

// mount replaces a container's contents.
export function mount(container, ...children) {
  container.replaceChildren();
  append(container, children);
}

// Icons, 16px, drawn for this page.
const ICONS = {
  check: ['M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.03 4.97a.75.75 0 0 0-1.06 0L7 8.94 6.03 7.97a.75.75 0 0 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0 0-1.06Z'],
  alert: ['M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 4Zm0 7.5a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z'],
  up: ['M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3.25a.75.75 0 0 0-.53.22l-2.5 2.5a.75.75 0 1 0 1.06 1.06l1.22-1.22v3.94a.75.75 0 0 0 1.5 0V6.81l1.22 1.22a.75.75 0 1 0 1.06-1.06l-2.5-2.5A.75.75 0 0 0 8 4.25Z'],
  dot: ['M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'],
  lock: ['M5 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 13 7.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-5A1.5 1.5 0 0 1 4.5 6Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0Z'],
  plus: ['M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z'],
  copy: ['M5 1.75A1.75 1.75 0 0 1 6.75 0h6.5A1.75 1.75 0 0 1 15 1.75v6.5A1.75 1.75 0 0 1 13.25 10h-6.5A1.75 1.75 0 0 1 5 8.25Zm1.75-.25a.25.25 0 0 0-.25.25v6.5c0 .14.11.25.25.25h6.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25ZM1 6.75C1 5.78 1.78 5 2.75 5h.75v1.5h-.75a.25.25 0 0 0-.25.25v6.5c0 .14.11.25.25.25h6.5a.25.25 0 0 0 .25-.25v-.75H11v.75A1.75 1.75 0 0 1 9.25 15h-6.5A1.75 1.75 0 0 1 1 13.25Z'],
  star: ['M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z'],
  search: ['M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z'],
  tick: ['M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z'],
  arrowUp: ['M8 3.5 3.5 8h3v4.5h3V8h3Z'],
  arrowDown: ['M8 12.5 12.5 8h-3V3.5h-3V8h-3Z'],
};

export function icon(name, size = 16) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of [['width', String(size)], ['height', String(size)], ['viewBox', '0 0 16 16'], ['fill', 'currentColor'], ['aria-hidden', 'true']]) {
    svg.setAttribute(k, v);
  }
  for (const d of ICONS[name] || ICONS.dot) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
