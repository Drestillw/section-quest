// Главный игровой экран: строим сечение касаниями прямо в 3D.
import { LEVELS, WORLDS } from '../data.js';
import { Construction, classify, cap1, prettySeq, pretty } from '../engine.js';
import { COL } from '../scene.js';
import { RULES, PRAISE, OOPS, ACH } from '../content.js';
import { FX, sfx } from '../fx.js';
import { TG } from '../tg.js';
import { h, sheet, sleep, toast } from '../ui.js';
import { S, save } from '../store.js';
import { checkAch, announce } from '../progress.js';

const SOFT = new Set(['dup', 'known', 'early']);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

export const LevelScreen = {
  stage: true,
  box: { top: 'calc(var(--safe-t) + var(--tg-t) + 128px)', bottom: 'calc(var(--safe-b) + 236px)' },
  async enter(app, { id }) {
    this.app = app;
    const sc = this.sc = app.scene;
    const lv = this.lv = LEVELS.find((l) => l.id === id);
    const poly = app.poly(lv.shape);
    const c = this.c = new Construction(poly, lv.given.map((g) => ({ name: g.name, p: g.p })));
    const solved = c.solve();
    const [yaw, pitch] = this.view = app.bestView(lv.shape, c.plane.n);
    sc.loadPoly(poly, { yaw, pitch, fitPts: [...solved.st.pts.values()].map((k) => k.p) });
    this.run = { st: c.initialState(), stack: [], errors: 0, hints: 0, sel: null, busy: true, done: false };
    this.buildUI();
    this.setCoach(`<b>Задача.</b> ${lv.task.replace(/\n/g, '<br>')}`, '');
    let i = 0;
    for (const kp of this.run.st.pts.values()) sc.addPoint(kp, { animate: true, delay: 0.2 + 0.28 * i++ });
    sc.onTap = (hit) => this.tap(hit);
    setTimeout(() => { this.run.busy = false; }, 900);
    if (!S.d.tut) setTimeout(() => this.tutorial(true), 1100);
  },

  leave() {
    this.tut?.close?.(); this.resSheet?.close?.();
    this.run && (this.run.busy = true);
    this.sc?.clearSelection();
    clearTimeout(this.t1);
  },

  buildUI() {
    const { lv, c } = this;
    const el = this.app.screens.level.el;
    el.innerHTML = '';
    this.stepsEl = h('div.steps', null, [...c.target.keys()].map(() => h('i')));
    this.coachTx = h('div.tx');
    this.coachAv = h('div.av', null, '🦉');
    this.coach = h('div.card.coach', null, this.coachAv, this.coachTx);
    const names = c.given.map((g) => `<b>${prettySeq([g.name])}</b>`).join(', ');
    el.append(
      h('div.hud-top', null,
        h('div.hud-row', null,
          TG.inTg ? null : h('button.iconbtn', { onclick: () => this.app.back(), 'aria-label': 'Назад' }, '←'),
          h('div.hud-title', null,
            h('div.t1', null, `${WORLDS[lv.world].emoji} Уровень ${lv.id}`),
            h('div.t2', null, lv.title)),
          h('button.iconbtn', { onclick: () => this.tutorial(false), 'aria-label': 'Как играть' }, '❓')),
        this.stepsEl,
        h('div.taskline', { html: `Сечение через ${names}` })),
      h('div.dock', null,
        this.coach,
        h('div.tools', null,
          h('button.btn.glass', { onclick: () => this.hint() }, '💡', h('span.lb', null, 'Подсказка')),
          h('button.btn.glass', { onclick: () => this.undo() }, '↩', h('span.lb', null, 'Отмена')),
          h('button.btn.glass', { onclick: () => this.sc.setView(...this.view) }, '🎯', h('span.lb', null, 'Ракурс')))));
  },

  setCoach(html, kind = '') {
    this.coachTx.innerHTML = html;
    this.coach.className = 'card coach ' + kind;
    this.coach.scrollTop = 0;
    this.coachAv.textContent = kind === 'err' ? '🙈' : kind === 'ok' ? '🦉' : '🦉';
  },
  updateSteps() {
    const [n] = this.c.progress(this.run.st);
    [...this.stepsEl.children].forEach((i, k) => i.classList.toggle('on', k < n));
  },

  // ------------------------------------------------------------ ввод
  tap(hit) {
    const run = this.run, sc = this.sc;
    if (run.busy || run.done) return;
    if (!hit) {
      if (run.sel) { run.sel = null; sc.clearSelection(); this.setCoach('Выбор снят. Коснись точки, отрезка или ребра.', ''); }
      return;
    }
    if (!run.sel) {
      run.sel = hit; sc.select(hit); sfx.select();
      this.setCoach(this.selectMsg(hit), '');
      return;
    }
    const A = run.sel, B = hit;
    if (A.kind === B.kind && JSON.stringify(A.id) === JSON.stringify(B.id)) {
      run.sel = null; sc.clearSelection(); sfx.tap();
      this.setCoach('Выбор снят. Коснись точки, отрезка или ребра.', '');
      return;
    }
    run.sel = null; sc.clearSelection();
    this.resolve(A, B);
  },
  selectMsg(hit) {
    const nm = (id) => `<b>${prettySeq([id])}</b>`;
    if (hit.kind === 'point') return `Выбрана точка ${nm(hit.id)}. Теперь коснись <b>второй точки</b> в той же грани — или готового <b>отрезка</b>, чтобы провести параллельную прямую.`;
    if (hit.kind === 'vertex') return `Выбрана вершина ${nm(hit.id)}. Она пока не в плоскости сечения — выбери вторую точку и посмотрим, что получится.`;
    if (hit.kind === 'seg') return 'Выбран отрезок. Коснись <b>точки</b> (проведём параллельную прямую) или <b>ребра</b> (продлим отрезок до пересечения с ним).';
    return `Выбрано ребро ${pretty(hit.id[0])}${pretty(hit.id[1])}. Теперь коснись <b>отрезка</b>, который нужно продлить до этого ребра.`;
  },

  resolve(A, B) {
    const c = this.c, run = this.run;
    const pts = [A, B].filter((x) => x.kind === 'point' || x.kind === 'vertex');
    const seg = [A, B].find((x) => x.kind === 'seg');
    const edge = [A, B].find((x) => x.kind === 'edge');
    let r;
    if (pts.length === 2) r = c.connect(run.st, pts[0].id, pts[1].id);
    else if (pts.length === 1 && seg) r = c.parallel(run.st, pts[0].id, seg.id);
    else if (seg && edge) r = c.extend(run.st, seg.id, edge.id);
    else {
      sfx.soft();
      this.setCoach('Так не получится 🙂 Помни: <b>две точки</b> — соединить, <b>точка + отрезок</b> — параллельная прямая, <b>отрезок + ребро</b> — продлить.', '');
      return;
    }
    r.ok ? this.success(r) : this.fail(r, A, B);
  },

  fail(r, A, B) {
    const sc = this.sc, run = this.run;
    if (SOFT.has(r.code)) {
      sfx.soft();
      this.setCoach(r.text, '');
      return;
    }
    run.errors++;
    sfx.bad(); sc.shake();
    this.setCoach(`<b>${rnd(OOPS)}</b> ${r.text}`, 'err');
    const refs = [];
    for (const x of [A, B]) {
      if (x.kind === 'point' || x.kind === 'vertex') refs.push({ kind: x.kind, id: x.id });
    }
    sc.pulse(refs, { color: COL.red, ms: 1600 });
    if (r.ptFaces) {
      const cols = [COL.gold, COL.cyan];
      Object.values(r.ptFaces).forEach((fs, i) => fs.length && sc.highlightFaces(fs, { color: cols[i % 2], hold: 1.6, strength: 0.34 }));
    }
    if (r.segFaces) sc.highlightFaces(r.segFaces, { color: COL.pink, hold: 1.4 });
    if (r.edge) sc.pulse([{ kind: 'edge', id: r.edge }], { color: COL.red, ms: 1500 });
  },

  async success(r) {
    const { sc, c, run } = this;
    run.busy = true;
    run.stack.push(run.st);
    run.st = r.st;
    const step = r.step;
    sfx.good();
    sc.highlightFaces(step.faces, { color: COL.pink, hold: 1.0 });
    if (step.kind === 'extend') {
      sc.addDashed(step.dashed[0], { delay: 0.1, duration: 0.6 });
      sc.addDashed(step.dashed[1], { delay: 0.35, duration: 0.6 });
      step.added.forEach((kp) => sc.addPoint(kp, { delay: 0.95 }));
    } else {
      sfx.draw();
      step.dashed.forEach((d) => sc.addDashed(d, { delay: 0.1, duration: 0.7 }));
      sc.addSegment(step.seg, { delay: 0.15, duration: 0.8 });
      step.added.forEach((kp) => {
        const near = Math.hypot(kp.p[0] - step.seg.p[0], kp.p[1] - step.seg.p[1], kp.p[2] - step.seg.p[2]) < 1e-6;
        sc.addPoint(kp, { delay: near ? 0.15 : 0.95 });
      });
    }
    this.updateSteps();
    this.setCoach(`<b>${rnd(PRAISE)}</b> ${step.text.replace(/\n/g, '<br>')}`, 'ok');
    await sleep(1150);
    if (c.complete(run.st)) { await this.victory(); return; }
    run.busy = false;
  },

  // ------------------------------------------------------------ кнопки
  hint() {
    const { c, run, sc } = this;
    if (run.done || run.busy) return;
    const acts = c.suggest(run.st);
    if (!acts.length) return;
    const a = acts[0];
    run.hints++;
    sfx.hint();
    const refs = a.kind === 'connect' ? [{ kind: 'point', id: a.a }, { kind: 'point', id: a.b }]
      : a.kind === 'parallel' ? [{ kind: 'point', id: a.point }, { kind: 'seg', id: a.seg }]
        : [{ kind: 'seg', id: a.seg }, { kind: 'edge', id: a.edge }];
    sc.pulse(refs, { color: COL.gold, ms: 3200 });
    sc.highlightFaces([a.face], { color: COL.gold, hold: 1.8, strength: 0.28 });
    this.setCoach(`💡 ${c.hintText(a, run.st)}<br><i>(подсказка снимает звёздочку)</i>`, '');
  },
  undo() {
    const { run, sc, c } = this;
    if (run.done || run.busy || !run.stack.length) { if (!run.stack.length) toast('Пока нечего отменять'); return; }
    run.st = run.stack.pop();
    run.sel = null; sc.clearSelection(); sc.clearDynamic();
    for (const kp of run.st.pts.values()) sc.addPoint(kp, { animate: false });
    run.st.segs.forEach((s) => sc.addSegment(s, { animate: false }));
    run.st.dashed.forEach((d) => sc.addDashed(d, { animate: false }));
    this.updateSteps();
    sfx.soft();
    this.setCoach('Шаг отменён ↩ Попробуй по-другому.', '');
  },

  // ------------------------------------------------------------ победа
  async victory() {
    const { c, run, sc, lv } = this;
    run.done = true;
    const kind = classify(c.polygon);
    sc.setPolygon(c.polygon, { animate: true, delay: 0.1, duration: 1.0 });
    sc.setAutoRotate(0.45);
    sfx.win();
    sc.confetti();
    const stars = run.errors + run.hints === 0 ? 3 : run.errors + run.hints <= 2 ? 2 : 1;
    const old = S.d.stars[lv.id] || 0;
    S.d.stars[lv.id] = Math.max(old, stars);
    const gain = old === 0 ? 10 * stars : 5 * Math.max(0, stars - old);
    S.d.xp += gain;
    save();
    const fresh = checkAch();
    this.setCoach(`🎉 <b>Сечение построено!</b> Получился ${kind}. Смотри, как оно красиво переливается — покрути фигуру пальцем.`, 'ok');
    await sleep(1600);
    this.showResult({ stars, gain, kind, fresh, old });
    announce(fresh);
  },

  showResult({ stars, gain, kind, fresh }) {
    const { lv, c, run } = this;
    const names = prettySeq(c.polygonNames(run.st));
    const next = LEVELS.find((l) => l.id === lv.id + 1);
    const starEls = [0, 1, 2].map(() => h('span', null, '⭐'));
    const sh = this.resSheet = sheet(h('div.result', null,
      h('div.big', null, 'Уровень пройден!'),
      h('div.shape', { html: `Сечение <b>${names}</b> — ${kind}` }),
      h('div.starsbig', null, starEls),
      h('div', null,
        gain ? h('span.gain', null, `✨ +${gain} XP`) : h('span.gain', null, 'Лучший результат прежний'),
        h('span.gain', null, `🙈 ошибок: ${run.errors}`), h('span.gain', null, `💡 подсказок: ${run.hints}`)),
      fresh.length ? h('div.newach', { html: fresh.map((k) => `🏅 <b>Новое достижение:</b> ${ACH[k][0]} ${ACH[k][1]}`).join('<br>') }) : null,
      h('div.acts', null,
        next ? h('button.btn.primary.block', { onclick: () => { sh.close(); this.app.go('level', { id: next.id }, { replace: true }); } }, `Дальше: ${next.title} ▶`)
          : h('button.btn.primary.block', { onclick: () => { sh.close(); this.app.go('map', {}, { replace: true }); } }, '🏁 К карте'),
        h('button.btn.glass.block.small', { onclick: () => { sh.close(); this.app.go('level', { id: lv.id }, { replace: true }); } }, '🔁 Пройти заново'),
        h('button.btn.glass.block.small', { onclick: () => { sh.close(); this.app.go('map', {}, { replace: true }); } }, '🗺 К уровням'))),
      { dismiss: false });
    starEls.forEach((el, i) => { if (i < stars) setTimeout(() => { el.classList.add('on'); sfx.star(i); }, 500 + i * 380); });
  },

  // ------------------------------------------------------------ обучение
  tutorial(first) {
    const sh = this.tut = sheet(h('div', null,
      h('h3', null, 'Как строить сечение 👆'),
      h('p', { html: 'Вращай фигуру пальцем, щипком приближай. А строится всё <b>касаниями</b> — выбери два объекта:' }),
      h('div.rules', null, RULES.map((r) => h('div.rule-card', null, h('div.ic', null, r.icon), h('div', null, h('div.t', null, r.t), h('div.d', null, r.d))))),
      h('p', { html: 'Не знаешь, что делать? Жми <b>💡 Подсказка</b> — но она снимает звёздочку.' }),
      h('div.acts', null, h('button.btn.primary.block', { onclick: () => sh.close() }, 'Понятно, поехали!'))),
      { onClose: () => { if (first) { S.d.tut = true; save(); } } });
  },
};
