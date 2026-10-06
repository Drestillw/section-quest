import { App } from '../app.js';
import { LEVELS } from '../data.js';
import { Construction, V, planeFrom } from '../engine.js';
import { TG } from '../tg.js';
import { h } from '../ui.js';
import { S, save, rankOf, totalStars, levelsDone } from '../store.js';
import { FX, sfx } from '../fx.js';

export const Home = {
  stage: true,
  box: { top: 'calc(var(--safe-t) + var(--tg-t) + 168px)', bottom: 'calc(var(--safe-b) + 196px)' },
  async enter(app) {
    const sc = app.scene;
    const poly = app.poly('cube');
    sc.loadPoly(poly, { yaw: -0.5, pitch: 0.42, fitPts: [], minFit: 1.3 });
    sc.setAutoRotate(0.35);
    // «заставка»: плоскость скользит сквозь куб, сечение меняется на лету
    const n = V.norm([1, 1, 1]);
    const dMid = V.dot(n, poly.center);
    sc.showPlane({ n, d: dMid }, { size: 0.85 });
    this._raf = null;
    const t0 = performance.now();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000;
      const k = Math.sin(t * 0.55) * 0.5 * 1.52;       // смещение плоскости от центра
      const d = dMid + k;
      const pl = { n, d };
      sc.setLivePolygon(poly.sectionPolygon(pl));
      sc.movePlane(pl, k);
    };
    loop();

    const r = rankOf(S.d.xp);
    const el = app.screens.home.el;
    el.innerHTML = '';
    el.className = 'screen home active pad-top pad-bot';
    el.append(
      h('div.top', null,
        h('div.hello', { html: `Привет, <b>${TG.name}</b>! 💜<br>${r.emoji} ${r.name}` }),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button.iconbtn', { onclick: () => app.go('progress'), 'aria-label': 'Прогресс' }, '🏆'),
          h('button.iconbtn', { onclick: (e) => { S.d.sound = !S.d.sound; FX.enabled = S.d.sound; e.currentTarget.textContent = S.d.sound ? '🔊' : '🔇'; save(); sfx.tap(); }, 'aria-label': 'Звук' }, S.d.sound ? '🔊' : '🔇'))),
      h('div.logo', null,
        h('h1.grad', null, 'Сечения'),
        h('p', null, 'Учимся строить сечения в 3D ✨'),
        h('div.stat-row', { style: { marginTop: '12px' } },
          h('span.chip', null, `⭐ ${totalStars()}/${LEVELS.length * 3}`),
          h('span.chip', null, `✨ ${S.d.xp} XP`),
          h('span.chip', null, `🔥 ${S.d.days || 1}`))),
      h('div.bottom', null,
        h('button.btn.primary.block', { onclick: () => app.go('map') }, S.d.lessons.length || levelsDone() ? '🎮  Играть' : '🚀  Начать'),
        h('div.grid3', null,
          tile('🎓', 'Уроки', () => app.go('lessons')),
          tile('🧪', 'Песочница', () => app.go('sandbox')),
          tile('🧠', 'Тренажёр', () => app.go('quiz')))),
    );
  },
  leave() { cancelAnimationFrame(this._raf); this._raf = null; },
};
const tile = (e, t, fn) => h('div.tile', { onclick: fn }, h('span.e', null, e), t);
