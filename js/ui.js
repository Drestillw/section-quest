// DOM-хелперы: h(), тосты, нижние листы.
import { sfx } from './fx.js';

export function h(tag, props, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

let toastEl = null, toastT = 0;
export function toast(text, kind = '', ms = 2200) {
  if (!toastEl) { toastEl = h('div.toast'); document.body.append(toastEl); }
  toastEl.className = 'toast ' + kind;
  toastEl.innerHTML = text;
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}

/** Нижний лист. Возвращает {close, el}. */
export function sheet(content, { onClose, dismiss = true } = {}) {
  const back = h('div.backdrop');
  const el = h('div.sheet', null, content);
  document.body.append(back, el);
  requestAnimationFrame(() => { back.classList.add('show'); el.classList.add('show'); });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.classList.remove('show'); el.classList.remove('show');
    setTimeout(() => { back.remove(); el.remove(); }, 400);
    onClose?.();
  };
  if (dismiss) back.addEventListener('click', close);
  return { close, el };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const starsText = (n, total = 3) => '⭐'.repeat(n) + '✩'.repeat(total - n);

export function bindPress(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn, .tile, .iconbtn, .node, .chip');
    if (b) sfx.tap();
  }, { passive: true });
}
