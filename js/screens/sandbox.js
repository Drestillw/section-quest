// Песочница: тащи три точки по рёбрам и смотри, как меняется сечение.
import { SHAPES } from '../data.js';
import { classify, planeFrom, V, cap1, sidesWord } from '../engine.js';
import { SANDBOX_PRESETS } from '../content.js';
import { sfx } from '../fx.js';
import { TG } from '../tg.js';
import { h, toast } from '../ui.js';
import { S, save } from '../store.js';
import { checkAch, announce } from '../progress.js';

const SHAPE_TABS = [['cube', 'Куб'], ['prism', 'Призма'], ['pyramid', 'Пирамида'], ['tetra', 'Тетраэдр']];
const NICE = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
const NAMES = ['M', 'N', 'K'];

export const Sandbox = {
  stage: true,
  box: { top: 'calc(var(--safe-t) + var(--tg-t) + 150px)', bottom: 'calc(var(--safe-b) + 214px)' },
  async enter(app, { shape = 'cube' } = {}) {
    this.app = app; this.shape = shape;
    this.build();
    this.load(shape, true);
  },
  leave() { cancelAnimationFrame(this._raf); this.app.scene.dragHook = null; },

  build() {
    const el = this.app.screens.sandbox.el;
    el.innerHTML = '';
    this.tabs = h('div.tabs', null, SHAPE_TABS.map(([k, n]) => h('button', { 'data-k': k, onclick: () => { sfx.tap(); this.load(k, true); } }, n)));
    this.info = h('div.card.info');
    this.presets = h('div.presets');
    el.append(
      h('div.hud-top', null,
        h('div.hud-row', null,
          TG.inTg ? null : h('button.iconbtn', { onclick: () => this.app.back() }, '←'),
          h('div.hud-title', null, h('div.t1', null, 'Песочница'), h('div.t2', null, 'Двигай точки по рёбрам 👆'))),
        this.tabs),
      h('div.dock', null, this.info, this.presets,
        h('div.tools', null,
          h('button.btn.glass', { onclick: () => this.random() }, '🎲 Случайно'),
          h('button.btn.glass', { onclick: () => this.app.scene.setView(...this.app.VIEWS[this.shape]) }, '🎯 Ракурс'))));
  },

  load(shape, preset) {
    const app = this.app, sc = app.scene;
    this.shape = shape;
    [...this.tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.k === shape));
    const poly = this.poly = app.poly(shape);
    sc.loadPoly(poly, { yaw: app.VIEWS[shape][0], pitch: app.VIEWS[shape][1], minFit: 1.15 });
    sc.setAutoRotate(0);
    const presets = SANDBOX_PRESETS[shape];
    this.presets.innerHTML = '';
    (presets || []).forEach((p) => this.presets.append(h('span.chip', { onclick: () => { sfx.tap(); this.setHandles(p.pts.map(([a, b, t]) => ({ edge: [a, b], t }))); } }, p.name)));
    this.presets.style.display = presets ? '' : 'none';
    // стартовые ручки
    const start = presets ? presets[3].pts.map(([a, b, t]) => ({ edge: [a, b], t })) : this.randomHandles();
    this.setHandles(start, true);
    sc.dragHook = (type, e, n) => this.drag(type, e, n);
  },

  randomHandles() {
    const edges = [...this.poly.edges].sort(() => Math.random() - 0.5).slice(0, 3);
    return edges.map((e) => ({ edge: [e[0], e[1]], t: NICE[1 + ((Math.random() * 5) | 0)] }));
  },
  random() { sfx.tap(); this.setHandles(this.randomHandles()); },

  pos(hd) { return V.lerp(this.poly.verts[hd.edge[0]], this.poly.verts[hd.edge[1]], hd.t); },

  autoView() {
    const pts = this.hs.map((hd) => this.pos(hd));
    try {
      const pl = planeFrom(...pts);
      const [yaw, pitch] = this.app.bestView(this.shape, pl.n);
      this.app.scene.setView(yaw, pitch, true);
    } catch { /* точки на одной прямой */ }
  },

  setHandles(hs, first = false) {
    const sc = this.app.scene;
    this.hs = hs.map((x) => ({ edge: x.edge.slice(), t: x.t }));
    this.autoView();
    if (first) {
      this.hs.forEach((hd, i) => sc.addPoint({ name: NAMES[i], p: this.pos(hd), kind: 'given', inFaces: new Set() }, { animate: true, delay: 0.15 * i }));
    } else {
      // плавно перелетаем к новым позициям
      const from = this.hs.map((hd, i) => sc.items.pts.get(NAMES[i])?.kp.p || this.pos(hd));
      const to = this.hs.map((hd) => this.pos(hd));
      sc.tween({ dur: 0.55, fn: (t) => {
        const e = 1 - (1 - t) ** 3;
        this.hs.forEach((_, i) => sc.movePoint(NAMES[i], V.lerp(from[i], to[i], e)));
        this.refresh(true);
      }, done: () => this.refresh(false) });
      return;
    }
    this.refresh(false);
  },

  refresh(quiet) {
    const sc = this.app.scene, poly = this.poly;
    const pts = NAMES.map((n, i) => sc.items.pts.get(n)?.kp.p || this.pos(this.hs[i]));
    let plane = null;
    try { plane = planeFrom(...pts); } catch { plane = null; }
    if (!plane) {
      sc.setLivePolygon(null);
      this.info.innerHTML = '<div class="big">Точки на одной прямой</div><div class="sm">Перетащи одну из них на другое ребро</div>';
      return;
    }
    const poly2 = poly.sectionPolygon(plane);
    sc.setLivePolygon(poly2);
    if (!this._planeAt || V.dist(this._planeAt.n, plane.n) > 1e-6 || Math.abs(this._planeAt.d - plane.d) > 1e-6 || !sc.planeObj) {
      sc.showPlane(plane, { center: poly2.length ? V.mean(poly2) : null, size: 0.95, instant: true });
      this._planeAt = plane;
    }
    const kind = poly2.length ? classify(poly2) : 'нет сечения';
    const n = poly2.length;
    this.info.innerHTML = `<div class="big grad">${cap1(kind)}</div><div class="sm">${n ? `${n} ${n === 3 ? 'стороны' : n < 5 ? 'стороны' : 'сторон'}` : ''}</div>`;
    if (!quiet && kind === 'правильный шестиугольник' && !S.d.ach.includes('sandbox')) {
      announce(checkAch(['sandbox'])); sfx.good();
    }
    this.lastKind = kind;
  },

  // ---- перетаскивание точек по рёбрам
  drag(type, e) {
    const sc = this.app.scene;
    const rect = sc.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (type === 'down') {
      let best = null;
      this.hs.forEach((hd, i) => {
        const it = sc.items.pts.get(NAMES[i]);
        if (!it) return;
        const s = sc.project(it.group.position, true);
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < 44 && (!best || d < best.d)) best = { i, d };
      });
      this.dragging = best ? best.i : null;
      if (best) TG.impact('light');
      return false;
    }
    if (this.dragging == null) return type === 'up' ? false : false;
    if (type === 'move') {
      const i = this.dragging, hd = this.hs[i];
      // ближайшая точка на любом ребре в экранных координатах
      let best = null;
      for (const [a, b] of this.poly.edges) {
        const A = sc.project(this.poly.verts[a]), B = sc.project(this.poly.verts[b]);
        const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / l2));
        const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
        const cur = (a === hd.edge[0] && b === hd.edge[1]) || (a === hd.edge[1] && b === hd.edge[0]);
        const score = d - (cur ? 14 : 0);
        if (!best || score < best.score) best = { a, b, t, score };
      }
      let t = Math.max(0.04, Math.min(0.96, best.t));
      for (const nv of NICE) if (Math.abs(t - nv) < 0.028 && nv > 0.03 && nv < 0.97) { t = nv; break; }
      const snapped = NICE.includes(t);
      if (snapped && (hd.t !== t || hd.edge[0] !== best.a)) TG.select();
      hd.edge = [best.a, best.b]; hd.t = t;
      sc.movePoint(NAMES[i], this.pos(hd));
      this.refresh(true);
      return true;
    }
    if (type === 'up') {
      this.dragging = null; this.refresh(false);
      try {
        const pl = planeFrom(...this.hs.map((hd) => this.pos(hd)));
        if (this.app.viewScore(pl.n) < 0.3) this.autoView();
      } catch { /* нет плоскости */ }
      return true;
    }
    return false;
  },
};
