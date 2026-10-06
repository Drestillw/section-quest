import { LEVELS } from '../data.js';
import { ACH } from '../content.js';
import { h, sheet } from '../ui.js';
import { S, rankOf, totalStars, levelsDone, resetAll } from '../store.js';

export const ProgressScreen = {
  stage: false, scroll: true,
  enter(app) {
    const el = app.screens.progress.el;
    el.innerHTML = '';
    const r = rankOf(S.d.xp);
    const q = S.d.quiz;
    el.append(h('div.prog.pad-top.pad-bot', null,
      h('div.map-head', null, h('h2.grad', null, 'Прогресс'), h('span.chip', null, `🔥 ${S.d.days || 1} дн.`)),
      h('div.card.hero', null,
        h('div.rk', null, r.emoji), h('div.rn', null, r.name),
        h('div.bar', null, h('i', { style: { width: '0%' } })),
        h('div', { style: { color: 'var(--ink2)', fontSize: '13.5px' } }, r.to ? `${S.d.xp} / ${r.to} XP до следующего ранга` : `${S.d.xp} XP — максимальный ранг!`)),
      h('div.statgrid', null,
        stat(`${totalStars()}/${LEVELS.length * 3}`, '⭐ звёзд'),
        stat(`${levelsDone()}/${LEVELS.length}`, '🎮 уровней'),
        stat(`${S.d.lessons.length}/5`, '🎓 уроков'),
        stat(`${q.ok}/${q.total}`, '🧠 тренажёр')),
      h('div.sec-title', null, `Достижения · ${S.d.ach.length}/${Object.keys(ACH).length}`),
      h('div.achgrid', null, Object.entries(ACH).map(([k, [e, t, d]]) =>
        h('div.ach' + (S.d.ach.includes(k) ? '' : '.lock'), null, h('span.e', null, S.d.ach.includes(k) ? e : '🔒'), h('b', null, t), d))),
      h('div', { style: { textAlign: 'center' } },
        h('button.linkbtn', { onclick: () => confirmReset(app) }, 'Сбросить прогресс'))));
    setTimeout(() => { const b = el.querySelector('.bar > i'); if (b) b.style.width = Math.round(r.pct * 100) + '%'; }, 250);
  },
};
const stat = (b, s) => h('div.stat', null, h('b', null, b), h('span', null, s));
function confirmReset(app) {
  const sh = sheet(h('div', null,
    h('h3', null, 'Сбросить прогресс?'),
    h('p', null, 'Звёзды, достижения и опыт будут удалены. Это нельзя отменить.'),
    h('div.acts', null,
      h('button.btn.primary.block', { onclick: () => { resetAll(); sh.close(); app.go('progress', {}, { replace: true }); } }, 'Да, сбросить'),
      h('button.btn.glass.block.small', { onclick: () => sh.close() }, 'Отмена'))));
}
