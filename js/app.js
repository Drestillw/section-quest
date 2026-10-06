// Роутер, общая 3D-сцена, загрузка.
import { SHAPES } from './data.js';
import { Poly, V } from './engine.js';
import { SectionScene } from './scene.js';
import { TG } from './tg.js';
import { h } from './ui.js';

export const App = {
  scene: null, screens: {}, cur: null, stack: [], root: null,
  VIEWS: { cube: [-0.42, 0.38], prism: [-0.49, 0.42], pyramid: [-0.45, 0.45], tetra: [-0.38, 0.44] },
  polys: {},

  init() {
    this.root = document.getElementById('app');
    this.stageEl = document.getElementById('stage');
    this.scene = new SectionScene(this.stageEl, { focusY: 0 });
    // звёзды на фоне
    const st = document.querySelector('.stars');
    for (let i = 0; i < 46; i++) {
      const s = document.createElement('i');
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${(Math.random() * 3).toFixed(2)}s;transform:scale(${0.6 + Math.random() * 0.9})`;
      st.append(s);
    }
  },
  poly(shape) { return (this.polys[shape] ||= new Poly(SHAPES[shape])); },

  /** Подбираем ракурс так, чтобы плоскость сечения не смотрела на нас ребром. */
  bestView(shape, normal) {
    let [yaw, pitch] = this.VIEWS[shape];
    if (!normal) return [yaw, pitch];
    const n3 = [normal[0], normal[2], -normal[1]];
    const score = (y, p) => {
      const x1 = n3[0] * Math.cos(y) + n3[2] * Math.sin(y), z1 = -n3[0] * Math.sin(y) + n3[2] * Math.cos(y), y1 = n3[1];
      return Math.abs(y1 * Math.sin(p) + z1 * Math.cos(p));
    };
    let best = [score(yaw, pitch), yaw, pitch];
    if (best[0] >= 0.5) return [yaw, pitch];
    for (const dp of [0, 0.1, -0.1, 0.2]) for (const dy of [0, -0.17, 0.17, -0.35, 0.35, -0.55, 0.55, 0.85, -0.85]) {
      const y = yaw + dy, p = pitch + dp, s = score(y, p);
      if (s >= 0.5) return [y, p];
      if (s > best[0]) best = [s, y, p];
    }
    return [best[1], best[2]];
  },

  /** Насколько плоскость повернута к зрителю при текущем ракурсе (0 — ребром, 1 — анфас). */
  viewScore(normal) {
    const v = this.scene.view, n3 = [normal[0], normal[2], -normal[1]];
    const x1 = n3[0] * Math.cos(v.yaw) + n3[2] * Math.sin(v.yaw), z1 = -n3[0] * Math.sin(v.yaw) + n3[2] * Math.cos(v.yaw);
    return Math.abs(n3[1] * Math.sin(v.pitch) + z1 * Math.cos(v.pitch));
  },

  register(name, screen) { this.screens[name] = screen; },

  async go(name, params = {}, { replace = false } = {}) {
    const next = this.screens[name];
    if (!next) return;
    if (this.cur) await this.cur.leave?.();
    if (!replace && this.cur && this.curName !== name) this.stack.push({ name: this.curName, params: this.curParams });
    if (replace && this.cur) { /* не кладём в стек */ }
    this.cur = next; this.curName = name; this.curParams = params;
    this.scene.onTap = null; this.scene.dragHook = null; this.scene.setAutoRotate(0);
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    this.stageEl.classList.toggle('off', !next.stage);
    const box = next.box || {};
    this.stageEl.style.top = box.top || '0px'; this.stageEl.style.bottom = box.bottom || '0px';
    this.scene._resize();
    next.stage ? this.scene.start() : this.scene.stop();
    if (!next.el) { next.el = h('div.screen' + (next.scroll ? '.scroll' : '')); this.root.append(next.el); }
    next.el.classList.add('active');
    await next.enter(this, params);
    this.syncBack();
  },
  syncBack() {
    if (this.stack.length) TG.showBack(() => this.back());
    else TG.hideBack();
  },
  back() {
    const prev = this.stack.pop();
    if (this.cur?.onBack && this.cur.onBack(this) === false) { if (prev) this.stack.push(prev); return; }
    if (prev) this.go(prev.name, prev.params, { replace: true });
    else this.go('home', {}, { replace: true });
  },
  home() { this.stack = []; this.go('home', {}, { replace: true }); },
};
