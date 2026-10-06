import { LEVELS } from '../data.js';
import { Construction, V, classify, cap1 } from '../engine.js';
import { LESSONS } from '../content.js';
import { sfx } from '../fx.js';
import { h, sleep } from '../ui.js';
import { S, save } from '../store.js';
import { checkAch, announce } from '../progress.js';
import { animateStep } from '../anim.js';

export const Lessons = {
  stage: true,
  box: { top: 'calc(var(--safe-t) + var(--tg-t) + 150px)', bottom: 'calc(var(--safe-b) + 38vh)' },
  async enter(app, { i = 0 } = {}) {
    this.app = app; this.i = i;
    this.render();
  },
  leave() { this.token = Symbol(); cancelAnimationFrame(this._raf); },

  render() {
    const { app, i } = this;
    const L = LESSONS[i];
    const el = app.screens.lessons.el;
    el.innerHTML = '';
    this.caption = h('div.caption', { style: { opacity: 0 } });
    const last = i === LESSONS.length - 1;
    el.append(
      h('div.hud-top', null,
        h('div.hud-row', null,
          h('div.hud-title', null, h('div.t1', null, `Урок ${i + 1} из ${LESSONS.length}`), h('div.t2', null, `${L.emoji} ${L.title}`))),
        h('div.dots', null, LESSONS.map((_, k) => h('i' + (k === i ? '.on' : '')))),
      ),
      this.caption,
      h('div.dock', null,
        h('div.card.lesson-card', null, h('h3', null, L.title), h('div.tx', { html: L.text })),
        h('div.tools', null,
          h('button.btn.glass', { onclick: () => this.go(i - 1), disabled: i === 0 }, '◀ Назад'),
          last ? h('button.btn.primary', { onclick: () => app.go('map', {}, { replace: false }) }, '🎮 Играть!')
            : h('button.btn.primary', { onclick: () => this.go(i + 1) }, 'Дальше ▶'))));
    S.d.lessons.includes(i) || S.d.lessons.push(i);
    save();
    announce(checkAch());
    this.runDemo(L.demo);
  },
  go(k) { if (k < 0 || k >= LESSONS.length) return; sfx.tap(); this.leave(); this.i = k; this.render(); },

  setCaption(html) {
    this.caption.style.opacity = html ? 1 : 0;
    if (html) this.caption.innerHTML = html;
  },

  async runDemo(demo) {
    const tok = this.token = Symbol();
    const alive = () => this.token === tok;
    const sc = this.app.scene;
    if (demo.type === 'sweep') {
      const poly = this.app.poly('cube');
      sc.loadPoly(poly, { yaw: -0.5, pitch: 0.42, minFit: 1.3 });
      sc.setAutoRotate(0.4);
      const n = V.norm([1, 1, 1]), dMid = V.dot(n, poly.center);
      sc.showPlane({ n, d: dMid }, { size: 0.85 });
      const t0 = performance.now();
      let lastKind = '';
      const loop = () => {
        if (!alive()) return;
        this._raf = requestAnimationFrame(loop);
        const t = (performance.now() - t0) / 1000;
        const k = Math.sin(t * 0.6) * 0.5 * 1.52, pl = { n, d: dMid + k };
        const pg = poly.sectionPolygon(pl);
        sc.setLivePolygon(pg); sc.movePlane(pl, k);
        const kind = pg.length ? cap1(pg.length === 3 ? 'треугольник' : pg.length === 6 ? 'шестиугольник' : pg.length + '-угольник') : '';
        if (kind !== lastKind) { lastKind = kind; this.setCaption(kind ? `Сейчас в сечении: <b>${kind}</b>` : ''); }
      };
      loop();
      return;
    }
    // демо на уровне: проигрываем каноническое решение по кругу
    const lv = LEVELS.find((l) => l.id === demo.id);
    const poly = this.app.poly(lv.shape);
    const c = new Construction(poly, lv.given.map((g) => ({ name: g.name, p: g.p })));
    const solved = c.solve();
    const [yaw, pitch] = this.app.bestView(lv.shape, c.plane.n);
    while (alive()) {
      sc.loadPoly(poly, { yaw, pitch, fitPts: [...solved.st.pts.values()].map((k) => k.p) });
      sc.setAutoRotate(0);
      let st = c.initialState();
      let k = 0;
      for (const kp of st.pts.values()) sc.addPoint(kp, { animate: true, delay: 0.2 + 0.25 * k++ });
      this.setCaption(`Дано: ${[...st.pts.keys()].map((n) => `<b>${n}</b>`).join(', ')}`);
      await sleep(1700); if (!alive()) return;
      for (const a of solved.steps) {
        const r = c.apply(st, a.act);
        st = r.st;
        animateStep(sc, r.step, 0);
        this.setCaption(shortCaption(r.step, c));
        sfx.draw();
        await sleep(3300); if (!alive()) return;
      }
      sc.setPolygon(c.polygon, { animate: true });
      sc.setAutoRotate(demo.spin ? 0.7 : 0.3);
      sc.confetti();
      this.setCaption(`🎉 Получилось: <b>${classify(c.polygon)}</b>!`);
      await sleep(3600); if (!alive()) return;
      this.setCaption('');
      await sleep(300);
    }
  },
};

function shortCaption(step, c) {
  const nm = (n) => `<b>${n.replace(/(\d+)/, (m) => [...m].map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join(''))}</b>`;
  const face = c.poly.faceTitle(step.face);
  if (step.kind === 'connect') {
    const aux = step.via.some((n) => c.ptAt ? false : false);
    return `Точки ${nm(step.via[0])} и ${nm(step.via[1])} лежат в одной грани <b>${face}</b> — соединяем`;
  }
  if (step.kind === 'parallel') return `Грани параллельны ⇒ через ${nm(step.via[0])} проводим параллельную прямую`;
  return `Продлеваем отрезок до прямой ребра — получаем точку ${nm(step.added[0].name)} (след)`;
}
