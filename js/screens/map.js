import { LEVELS, WORLDS } from '../data.js';
import { h, sheet, starsText } from '../ui.js';
import { S, unlocked, totalStars } from '../store.js';

const STEP = 108;
export const MapScreen = {
  stage: false, scroll: true,
  enter(app) {
    const el = app.screens.map.el;
    el.innerHTML = '';
    const W = Math.min(window.innerWidth, 560) - 36;
    const cur = LEVELS.find((l) => unlocked(l.id) && !(S.d.stars[l.id] > 0));
    const wrap = h('div.map.pad-top.pad-bot', null,
      h('div.map-head', null,
        h('h2.grad', null, 'Карта уровней'),
        h('span.chip', null, `⭐ ${totalStars()}/${LEVELS.length * 3}`)),
    );
    for (const [w, info] of Object.entries(WORLDS)) {
      const lvls = LEVELS.filter((l) => l.world === +w);
      const got = lvls.reduce((s, l) => s + (S.d.stars[l.id] || 0), 0);
      const pts = lvls.map((_, i) => [W * (0.5 + 0.30 * Math.sin(i * 1.3 + (+w))), 52 + i * STEP]);
      const H = 52 + (lvls.length - 1) * STEP + 96;
      const path = h('div.path', { style: { height: H + 'px' } });
      // плавная пунктирная тропа
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2;
        d += ` C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
      }
      path.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="14" stroke-linecap="round"/><path d="${d}" fill="none" stroke="rgba(255,150,210,.55)" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round"/></svg>`;
      lvls.forEach((lv, i) => {
        const st = S.d.stars[lv.id] || 0, open = unlocked(lv.id);
        const cls = !open ? 'lock' : st ? 'done' : lv === cur ? 'cur' : '';
        const node = h(`div.node.${cls || 'open'}`, { style: { left: pts[i][0] + 'px', top: pts[i][1] - 32 + 'px' }, onclick: () => open ? levelSheet(app, lv) : lockedHint(lv) },
          h('div.dot', null, open ? String(lv.id) : '🔒'),
          h('div.stars', null, st ? starsText(st) : ''),
          h('div.nm', null, open ? lv.title : ''));
        path.append(node);
      });
      wrap.append(h('div.chapter', null,
        h('div.chapter-title', null, h('span.em', null, info.emoji), info.title, h('span.sub', null, `${got}/${lvls.length * 3} ⭐`)),
        path));
    }
    el.append(wrap);
    if (cur) setTimeout(() => el.scrollTo({ top: Math.max(0, 0), behavior: 'auto' }), 0);
    // прокрутить к текущему уровню
    setTimeout(() => {
      const n = el.querySelector('.node.cur');
      if (n) el.scrollTo({ top: n.offsetTop + n.closest('.chapter').offsetTop - window.innerHeight * 0.35, behavior: 'smooth' });
    }, 350);
  },
};

function lockedHint(lv) {
  import('../ui.js').then(({ toast }) => toast('Сначала пройди предыдущий уровень 🔒'));
}

export function levelSheet(app, lv) {
  const best = S.d.stars[lv.id] || 0;
  const task = lv.task.replace(/\n/g, '<br>');
  const sh = sheet(h('div', null,
    h('h3', null, `${WORLDS[lv.world].emoji} Уровень ${lv.id} · ${lv.title}`),
    h('span.rule', null, lv.rule),
    h('p', { html: lv.intro }),
    h('div.task', { html: task }),
    best ? h('p', null, `Твой результат: ${starsText(best)}`) : null,
    h('div.acts', null,
      h('button.btn.primary.block', { onclick: () => { sh.close(); app.go('level', { id: lv.id }); } }, best ? '🔁  Пройти снова' : '🚀  Начать'),
      h('button.btn.glass.block.small', { onclick: () => sh.close() }, 'Закрыть'))));
}
