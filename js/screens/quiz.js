// Тренажёр «Угадай сечение».
import { SHAPES } from '../data.js';
import { Poly, planeFrom, makeQuiz, mulberry32, describeEdgePoint, sidesWord, cap1, MAX_SIDES, V, classify } from '../engine.js';
import { PRAISE } from '../content.js';
import { sfx } from '../fx.js';
import { TG } from '../tg.js';
import { h, sleep } from '../ui.js';
import { S, save } from '../store.js';
import { checkAch, announce } from '../progress.js';

const NAMES = ['M', 'N', 'K'];
const LABEL = { 3: '3️⃣ Треугольник', 4: '4️⃣ Четырёхугольник', 5: '5️⃣ Пятиугольник', 6: '6️⃣ Шестиугольник' };

export const Quiz = {
  stage: true,
  box: { top: 'calc(var(--safe-t) + var(--tg-t) + 82px)', bottom: 'calc(var(--safe-b) + 320px)' },
  async enter(app) { this.app = app; this.build(); this.next(); },
  leave() { this.tok = Symbol(); },

  build() {
    const el = this.app.screens.quiz.el;
    el.innerHTML = '';
    this.streak = h('span.chip', null);
    this.card = h('div.card.qcard');
    this.opts = h('div.opts');
    this.nextBtn = h('button.btn.primary.block', { onclick: () => this.next(), style: { display: 'none' } }, 'Дальше ▶');
    el.append(
      h('div.hud-top', null,
        h('div.hud-row', null,
          TG.inTg ? null : h('button.iconbtn', { onclick: () => this.app.back() }, '←'),
          h('div.hud-title', null, h('div.t1', null, 'Тренажёр'), h('div.t2', null, 'Угадай сечение 🧠')),
          this.streak)),
      h('div.dock', null, this.card, this.opts, this.nextBtn));
    this.upd();
  },
  upd() {
    const q = S.d.quiz;
    this.streak.textContent = `🔥 ${q.streak} · ${q.ok}/${q.total}`;
  },

  next() {
    const app = this.app, sc = app.scene;
    const tok = this.tok = Symbol();
    this.answered = false;
    const q = this.q = makeQuiz(SHAPES, mulberry32((Math.random() * 1e9) | 0));
    const poly = this.poly = app.poly(q.shape);
    this.plane = planeFrom(...q.pts);
    const [yaw, pitch] = app.bestView(q.shape, this.plane.n);
    sc.loadPoly(poly, { yaw, pitch });
    sc.setAutoRotate(0);
    q.pts.forEach((p, i) => sc.addPoint({ name: NAMES[i], p, kind: 'given', inFaces: poly.facesContaining(p) }, { delay: 0.2 + i * 0.25 }));
    const lines = q.edges.map(([a, b], i) => '• ' + describeEdgePoint(NAMES[i], a, b, q.ts[i]));
    this.card.innerHTML = `<div>Плоскость проходит через точки <b>M, N, K</b> на рёбрах ${poly.genitive}:<br>${lines.join('<br>')}</div><div class="q">Какая фигура получится в сечении?</div>`;
    this.opts.innerHTML = '';
    for (let n = 3; n <= MAX_SIDES[q.shape]; n++) {
      this.opts.append(h('button.btn.glass.opt', { 'data-n': n, onclick: (e) => this.answer(n, e.currentTarget) }, LABEL[n]));
    }
    this.nextBtn.style.display = 'none';
    this.opts.style.display = '';
    this.sc = sc;
  },

  async answer(n, btn) {
    if (this.answered) return;
    this.answered = true;
    const { q, poly, plane, sc } = this;
    const ok = n === q.n;
    const st = S.d.quiz;
    st.total++; if (ok) { st.ok++; st.streak++; st.best = Math.max(st.best, st.streak); S.d.xp += 4; } else st.streak = 0;
    save(); this.upd();
    btn.classList.add(ok ? 'good' : 'bad');
    if (!ok) [...this.opts.children].find((b) => +b.dataset.n === q.n)?.classList.add('good');
    ok ? (sfx.good(), TG.notify('success')) : sfx.bad();
    // раскрываем ответ
    const polygon = poly.sectionPolygon(plane);
    sc.showPlane(plane, { center: V.mean(polygon), size: 0.95 });
    const names = [...'PQRTUVW'];
    for (const v of polygon) {
      if (q.pts.some((p) => V.dist(p, v) < 1e-6) || poly.vertexAt(v)) continue;
      sc.addPoint({ name: names.shift(), p: v, kind: 'section', inFaces: poly.facesContaining(v) }, { delay: 0.3 });
    }
    poly.sectionSegments(plane).forEach((s, i) => {
      const fs = new Set(Object.keys(poly.faces).filter((f) => poly.inFace(f, s[0]) && poly.inFace(f, s[1])));
      sc.addSegment({ p: s[0], q: s[1], faces: fs }, { delay: 0.3 + i * 0.12, duration: 0.5 });
    });
    sc.setPolygon(polygon, { animate: true, delay: 0.9 });
    sc.setAutoRotate(0.45);
    if (ok) sc.confetti();
    const kind = classify(polygon);
    this.card.innerHTML = ok
      ? `<div><b>${PRAISE[(Math.random() * PRAISE.length) | 0]}</b> Это ${kind}. <span style="color:var(--gold)">+4 XP</span>${st.streak >= 2 ? ` · 🔥 серия ${st.streak}` : ''}</div>`
      : `<div>Не совсем. В сечении получился <b>${kind}</b>. Попробуй построить такое в игре — станет понятнее 😉</div>`;
    announce(checkAch());
    await sleep(500);
    this.opts.style.display = 'none';
    this.nextBtn.style.display = '';
  },
};
