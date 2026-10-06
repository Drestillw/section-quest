// Геометрия многогранников и пошаговое построение сечения.
// Порт geometry.py + solver.py: результаты сверяются с Python-эталоном (miniapp/tests).

export const EPS = 1e-7;
const SUB = '₀₁₂₃₄₅₆₇₈₉';

// ---------------------------------------------------------------- векторы
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mean(list) {
    const s = [0, 0, 0];
    for (const p of list) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return [s[0] / list.length, s[1] / list.length, s[2] / list.length];
  },
};
const same = (a, b, eps = 1e-6) => V.dist(a, b) < eps;

export function pretty(name) {
  return name.replace(/\d+/g, (m) => [...m].map((c) => SUB[+c]).join(''));
}
export const prettySeq = (names) => names.map(pretty).join('');
export function splitLabel(name) {
  const m = /^([A-Za-z]+)(\d*)$/.exec(name);
  return m ? [m[1], m[2]] : [name, ''];
}

export function planeFrom(p, q, r) {
  const n = V.cross(V.sub(q, p), V.sub(r, p));
  const l = V.len(n);
  if (l < EPS) throw new Error('collinear');
  const nn = V.mul(n, 1 / l);
  return { n: nn, d: V.dot(nn, p) };
}
const planeDist = (pl, p) => V.dot(pl.n, p) - pl.d;

const r5 = (x) => Math.round(x * 1e5) / 1e5 + 0;
export function segKey(p, q) {
  const a = p.map(r5).join(','), b = q.map(r5).join(',');
  return a <= b ? a + '|' + b : b + '|' + a;
}

// ---------------------------------------------------------------- многогранник
export class Poly {
  constructor(def) {
    this.key = def.key;
    this.title = def.title;
    this.genitive = def.genitive;
    this.verts = {};
    for (const [k, v] of Object.entries(def.verts)) this.verts[k] = v.slice();
    this.faces = def.faces;
    this.center = V.mean(Object.values(this.verts));
    this.faceN = {}; this.faceD = {}; this.orient = {};
    for (const [f, names] of Object.entries(this.faces)) {
      const pts = names.map((n) => this.verts[n]);
      let newell = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) newell = V.add(newell, V.cross(pts[i], pts[(i + 1) % pts.length]));
      newell = V.norm(newell);
      let n = newell;
      if (V.dot(n, V.sub(V.mean(pts), this.center)) < 0) n = V.mul(n, -1);
      this.orient[f] = V.dot(newell, n) > 0 ? 1 : -1;
      this.faceN[f] = n;
      this.faceD[f] = V.dot(n, pts[0]);
    }
    this.edges = [];
    this.edgeFaces = {};
    for (const [f, names] of Object.entries(this.faces)) {
      for (let i = 0; i < names.length; i++) {
        const a = names[i], b = names[(i + 1) % names.length];
        const k = Poly.ekey(a, b);
        if (!this.edgeFaces[k]) { this.edgeFaces[k] = []; this.edges.push([a, b]); }
        this.edgeFaces[k].push(f);
      }
    }
    this.parallel = {};
    const fl = Object.keys(this.faces);
    for (let i = 0; i < fl.length; i++) {
      for (let j = i + 1; j < fl.length; j++) {
        if (V.dot(this.faceN[fl[i]], this.faceN[fl[j]]) < -1 + 1e-6) {
          this.parallel[fl[i]] = fl[j];
          this.parallel[fl[j]] = fl[i];
        }
      }
    }
  }
  static ekey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  faceTitle(f) { return prettySeq(this.faces[f]); }
  inPlaneOf(f, p, eps = 1e-6) { return Math.abs(V.dot(this.faceN[f], p) - this.faceD[f]) < eps; }
  inFace(f, p, eps = 1e-6) {
    if (!this.inPlaneOf(f, p, eps)) return false;
    const names = this.faces[f], n = this.faceN[f], sg = this.orient[f];
    for (let i = 0; i < names.length; i++) {
      const a = this.verts[names[i]], b = this.verts[names[(i + 1) % names.length]];
      if (sg * V.dot(V.cross(V.sub(b, a), V.sub(p, a)), n) < -eps) return false;
    }
    return true;
  }
  facesContaining(p) { return new Set(Object.keys(this.faces).filter((f) => this.inFace(f, p))); }
  planesContaining(p) { return new Set(Object.keys(this.faces).filter((f) => this.inPlaneOf(f, p))); }
  vertexAt(p) {
    for (const [k, v] of Object.entries(this.verts)) if (same(v, p)) return k;
    return null;
  }
  edgeAt(p) {
    for (const [a, b] of this.edges) {
      const pa = this.verts[a], ab = V.sub(this.verts[b], pa);
      const t = V.dot(V.sub(p, pa), ab) / V.dot(ab, ab);
      if (t >= -1e-9 && t <= 1 + 1e-9 && V.dist(V.add(pa, V.mul(ab, t)), p) < 1e-6) return [a, b];
    }
    return null;
  }
  otherFace(a, b, f) { return (this.edgeFaces[Poly.ekey(a, b)] || []).find((g) => g !== f) || null; }
  faceEdges(f) {
    const n = this.faces[f];
    return n.map((a, i) => [a, n[(i + 1) % n.length]]);
  }

  chord(f, plane) {
    const pts = this.faces[f].map((n) => this.verts[n]);
    const s = pts.map((p) => planeDist(plane, p));
    if (s.every((x) => Math.abs(x) < EPS)) return [];
    const out = [];
    const add = (p) => { if (!out.some((q) => same(p, q))) out.push(p); };
    const m = pts.length;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m], sa = s[i], sb = s[(i + 1) % m];
      if (Math.abs(sa) < EPS) add(a);
      else if (sa * sb < 0 && Math.abs(sb) >= EPS) add(V.add(a, V.mul(V.sub(b, a), sa / (sa - sb))));
    }
    return out;
  }
  sectionSegments(plane) {
    const seen = new Set(), out = [];
    for (const f of Object.keys(this.faces)) {
      const c = this.chord(f, plane);
      if (c.length === 2) {
        const k = segKey(c[0], c[1]);
        if (!seen.has(k)) { seen.add(k); out.push([c[0], c[1]]); }
      }
    }
    return out;
  }
  sectionPolygon(plane) {
    const pts = [];
    for (const f of Object.keys(this.faces)) {
      for (const p of this.chord(f, plane)) if (!pts.some((q) => same(p, q))) pts.push(p);
    }
    if (pts.length < 3) return [];
    const c = V.mean(pts);
    const u = V.norm(V.sub(pts[0], c));
    const w = V.cross(plane.n, u);
    const ang = (p) => Math.atan2(V.dot(V.sub(p, c), w), V.dot(V.sub(p, c), u));
    return pts.map((p) => [ang(p), p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
}

// ---------------------------------------------------------------- классификация
export function classify(poly) {
  const n = poly.length;
  if (n < 3) return 'ничего';
  const sides = poly.map((p, i) => V.sub(poly[(i + 1) % n], p));
  const lens = sides.map(V.len);
  const close = (a, b, tol = 1e-4) => Math.abs(a - b) < tol * Math.max(1, Math.abs(a), Math.abs(b));
  const par = (u, w) => V.len(V.cross(u, w)) < 1e-5 * V.len(u) * V.len(w);
  const perp = (u, w) => Math.abs(V.dot(u, w)) < 1e-5 * V.len(u) * V.len(w);
  if (n === 3) {
    const [a, b, c] = [...lens].sort((x, y) => x - y);
    if (close(a, c)) return 'равносторонний треугольник';
    if (close(a, b) || close(b, c)) {
      if (close(a * a + b * b, c * c) || close(a * a + a * a, c * c)) return 'прямоугольный равнобедренный треугольник';
      return 'равнобедренный треугольник';
    }
    if (close(a * a + b * b, c * c)) return 'прямоугольный треугольник';
    return 'треугольник';
  }
  if (n === 4) {
    const p1 = par(sides[0], sides[2]), p2 = par(sides[1], sides[3]);
    if (p1 && p2) {
      const rect = perp(sides[0], sides[1]), eq = close(lens[0], lens[1]);
      if (rect && eq) return 'квадрат';
      if (rect) return 'прямоугольник';
      if (eq) return 'ромб';
      return 'параллелограмм';
    }
    if (p1 || p2) {
      if (p1 ? close(lens[1], lens[3]) : close(lens[0], lens[2])) return 'равнобедренная трапеция';
      return 'трапеция';
    }
    return 'четырёхугольник';
  }
  if (n === 5) return 'пятиугольник';
  if (n === 6) {
    const cosv = (i) => V.dot(sides[i], sides[(i + 1) % 6]) / (lens[i] * lens[(i + 1) % 6]);
    const c0 = cosv(0);
    const angOk = [1, 2, 3, 4, 5].every((i) => close(cosv(i), c0));
    if (angOk && lens.every((l) => close(lens[0], l))) return 'правильный шестиугольник';
    return 'шестиугольник';
  }
  return `${n}-угольник`;
}
export const sidesWord = (n) => ({ 3: 'треугольник', 4: 'четырёхугольник', 5: 'пятиугольник', 6: 'шестиугольник' }[n] || `${n}-угольник`);
export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- построение
const SECTION_NAMES = ['L', 'P', 'Q', 'R', 'T', 'U', 'V', 'W'];
const AUX_NAMES = ['X', 'Y', 'Z'];
export const MAX_AUX_DIST = 3.2;

function lineIntersection(p1, p2, p3, p4) {
  const d1 = V.sub(p2, p1), d2 = V.sub(p4, p3);
  const cr = V.cross(d1, d2);
  if (V.len(cr) < 1e-6 * V.len(d1) * V.len(d2)) return null;
  const w = V.sub(p3, p1);
  // решаем s*d1 - t*d2 = w в смысле наименьших квадратов (прямые в одной плоскости)
  const a = V.dot(d1, d1), b = -V.dot(d1, d2), c = V.dot(d2, d2);
  const e = V.dot(d1, w), f = -V.dot(d2, w);
  const det = a * c - b * b;
  const s = (e * c - b * f) / det, t = (a * f - b * e) / det;
  const x = V.add(p1, V.mul(d1, s)), y = V.add(p3, V.mul(d2, t));
  return V.dist(x, y) > 1e-6 ? null : x;
}

export function copyState(st) {
  return {
    pts: new Map(st.pts),
    drawnFaces: new Set(st.drawnFaces),
    drawnKeys: new Set(st.drawnKeys),
    segs: st.segs.slice(),
    dashed: st.dashed.slice(),
  };
}

export class Construction {
  /** given: [{name, p}] */
  constructor(poly, given) {
    this.poly = poly;
    this.given = given;
    this.plane = planeFrom(given[0].p, given[1].p, given[2].p);
    this.chords = {};
    for (const f of Object.keys(poly.faces)) {
      const c = poly.chord(f, this.plane);
      if (c.length === 2) this.chords[f] = c;
    }
    this.target = new Map();
    for (const c of Object.values(this.chords)) this.target.set(segKey(c[0], c[1]), c);
    this.polygon = poly.sectionPolygon(this.plane);
    this.taken = new Set([...Object.keys(poly.verts), ...given.map((g) => g.name)]);
  }

  makeKP(name, p, kind, given = false) {
    return { name, p, kind, inFaces: this.poly.facesContaining(p), onPlanes: this.poly.planesContaining(p), given };
  }
  initialState() {
    const st = { pts: new Map(), drawnFaces: new Set(), drawnKeys: new Set(), segs: [], dashed: [] };
    for (const g of this.given) {
      st.pts.set(g.name, this.makeKP(g.name, g.p, this.poly.vertexAt(g.p) ? 'vertex' : 'given', true));
    }
    return st;
  }
  complete(st) { for (const k of this.target.keys()) if (!st.drawnKeys.has(k)) return false; return true; }
  progress(st) { let n = 0; for (const k of this.target.keys()) if (st.drawnKeys.has(k)) n++; return [n, this.target.size]; }
  knownInPlane(st, f) { return [...st.pts.values()].filter((k) => k.onPlanes.has(f)); }
  ptAt(st, p) { for (const k of st.pts.values()) if (same(k.p, p)) return k; return null; }
  bestPair(ks) {
    let best = [ks[0], ks[1]], bd = -1;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const d = V.dist(ks[i].p, ks[j].p);
      if (d > bd) { best = [ks[i], ks[j]]; bd = d; }
    }
    return best;
  }
  namePools(st) {
    const kps = [...st.pts.values()];
    const usedSec = kps.filter((k) => k.kind === 'section' && SECTION_NAMES.includes(k.name)).length;
    const usedAux = kps.filter((k) => k.kind === 'aux').length;
    return {
      sec: SECTION_NAMES.filter((n) => !this.taken.has(n)).slice(usedSec),
      aux: AUX_NAMES.filter((n) => !this.taken.has(n)).slice(usedAux),
    };
  }
  where(kp) {
    const v = this.poly.vertexAt(kp.p);
    if (v) return `вершина ${pretty(v)}`;
    const e = this.poly.edgeAt(kp.p);
    if (e) return `ребро ${pretty(e[0])}${pretty(e[1])}`;
    if (kp.inFaces.size) return `грань ${this.poly.faceTitle([...kp.inFaces].sort()[0])}`;
    return 'вне фигуры';
  }
  /** Имя прямой по двум самым далёким известным точкам на отрезке. */
  segLabel(st, seg) {
    const on = [...st.pts.values()].filter((k) => {
      const ab = V.sub(seg.q, seg.p), t = V.dot(V.sub(k.p, seg.p), ab) / V.dot(ab, ab);
      return t >= -1e-6 && t <= 1 + 1e-6 && V.dist(V.add(seg.p, V.mul(ab, t)), k.p) < 1e-6;
    });
    if (on.length < 2) return '';
    const [a, b] = this.bestPair(on);
    return pretty(a.name) + pretty(b.name);
  }
  segIndexOfFace(st, f) {
    const c = this.chords[f];
    if (!c) return -1;
    const k = segKey(c[0], c[1]);
    return st.segs.findIndex((s) => segKey(s.p, s.q) === k);
  }

  // ---- отрисовка хорды (общая для connect/parallel)
  drawChord(st, f, pools) {
    const [p, q] = this.chords[f];
    const ks = this.knownInPlane(st, f);
    const added = [];
    for (const e of [p, q]) {
      if (!this.ptAt(st, e)) {
        const vn = this.poly.vertexAt(e);
        let name, kind;
        if (vn && !st.pts.has(vn)) { name = vn; kind = 'vertex'; } else { name = pools.sec.shift(); kind = 'section'; }
        const kp = this.makeKP(name, e, kind);
        st.pts.set(name, kp);
        added.push(kp);
      }
    }
    const dashed = [];
    const d = V.sub(q, p), dd = V.dot(d, d);
    for (const k of ks) {
      if (k.kind !== 'aux') continue;
      const s = V.dot(V.sub(k.p, p), d) / dd;
      if (s < -1e-9) dashed.push({ p: k.p, q: p, style: 'ext' });
      else if (s > 1 + 1e-9) dashed.push({ p: q, q: k.p, style: 'ext' });
    }
    const key = segKey(p, q);
    st.drawnKeys.add(key);
    for (const [g, c] of Object.entries(this.chords)) if (segKey(c[0], c[1]) === key) st.drawnFaces.add(g);
    const faces = new Set(Object.keys(this.poly.faces).filter((g) => this.poly.inFace(g, p) && this.poly.inFace(g, q)));
    const seg = { p, q, faces };
    st.segs.push(seg);
    st.dashed.push(...dashed);
    return { added, seg, dashed };
  }
  newPointsText(added) {
    if (!added.length) return '';
    const parts = added.map((k) => `<b>${pretty(k.name)}</b> (${this.where(k)})`);
    return added.length === 1
      ? ' Прямая дошла до границы грани — новая вершина сечения: ' + parts[0] + '.'
      : ' Прямая дошла до границы грани — новые вершины сечения: ' + parts.join(' и ') + '.';
  }

  // ---- действие 1: соединить две точки
  connect(st0, nameA, nameB) {
    const poly = this.poly;
    const A = st0.pts.get(nameA), B = st0.pts.get(nameB);
    for (const [nm, kp] of [[nameA, A], [nameB, B]]) {
      if (!kp) {
        const inPlane = Math.abs(planeDist(this.plane, poly.verts[nm])) < 1e-6;
        return inPlane
          ? { ok: false, code: 'early', text: `Вершина <b>${pretty(nm)}</b> действительно лежит в плоскости сечения, но пока она не найдена — она появится сама, когда ты проведёшь отрезок через неё.`, ptFaces: {} }
          : { ok: false, code: 'foreign', text: `Вершина <b>${pretty(nm)}</b> не лежит в плоскости сечения (она не среди данных точек), поэтому сечение через неё не пройдёт.`, ptFaces: {} };
      }
    }
    const common = [...A.onPlanes].filter((f) => B.onPlanes.has(f));
    if (!common.length) {
      return {
        ok: false, code: 'noface',
        text: `Точки <b>${pretty(A.name)}</b> (${this.where(A)}) и <b>${pretty(B.name)}</b> (${this.where(B)}) не лежат в одной грани. Отрезок между ними пошёл бы внутри фигуры, а стороны сечения всегда лежат <i>в гранях</i>.`,
        ptFaces: { [A.name]: [...A.onPlanes], [B.name]: [...B.onPlanes] },
      };
    }
    const usable = common.filter((f) => this.chords[f]);
    if (!usable.length) {
      return { ok: false, code: 'nochord', text: 'Плоскость сечения не даёт в этой грани отрезка — соединять здесь нечего.', ptFaces: {} };
    }
    const fresh = usable.find((f) => !st0.drawnFaces.has(f) && !st0.drawnKeys.has(segKey(...this.chords[f])));
    if (!fresh) return { ok: false, code: 'dup', text: 'Этот отрезок уже проведён ✔️', ptFaces: {} };
    const st = copyState(st0);
    const { added, seg, dashed } = this.drawChord(st, fresh, this.namePools(st0));
    const aux = [A, B].filter((k) => k.kind === 'aux').length;
    const ft = poly.faceTitle(fresh);
    let text = aux
      ? `✅ <b>${pretty(A.name)}</b> и <b>${pretty(B.name)}</b> лежат в плоскости грани <b>${ft}</b> и в плоскости сечения. Значит, прямая ${pretty(A.name)}${pretty(B.name)} — <i>след</i> сечения на этой плоскости.`
      : `✅ Точки <b>${pretty(A.name)}</b> и <b>${pretty(B.name)}</b> лежат в одной грани <b>${ft}</b> — соединяем их.`;
    text += this.newPointsText(added);
    return { ok: true, st, step: { kind: 'connect', face: fresh, seg, added, dashed, faces: [fresh], text, via: [A.name, B.name] } };
  }

  // ---- действие 2: параллельная прямая через точку
  parallel(st0, ptName, segIdx) {
    const poly = this.poly;
    const P = st0.pts.get(ptName), S = st0.segs[segIdx];
    if (!P) return { ok: false, code: 'foreign', text: `Вершина <b>${pretty(ptName)}</b> не лежит в плоскости сечения — через неё параллельную прямую не проведёшь.`, ptFaces: {} };
    if (!Object.keys(poly.parallel).length) {
      return { ok: false, code: 'noparallel', text: 'У этой фигуры нет параллельных граней, так что правило параллельных следов здесь не работает. Попробуй метод следа: продли отрезок до ребра.', ptFaces: {} };
    }
    const cand = [];
    for (const F of S.faces) {
      const g = poly.parallel[F];
      if (g && P.onPlanes.has(g) && this.chords[g]) cand.push([F, g]);
    }
    if (!cand.length) {
      return {
        ok: false, code: 'notpar',
        text: `Отрезок лежит в грани ${[...S.faces].map((f) => poly.faceTitle(f)).join(' / ')}, а точка <b>${pretty(P.name)}</b> (${this.where(P)}) — не в параллельной ей грани. Правило параллельных граней тут не сработает.`,
        ptFaces: { [P.name]: [...P.onPlanes] }, segFaces: [...S.faces],
      };
    }
    const fresh = cand.find(([, g]) => !st0.drawnFaces.has(g) && !st0.drawnKeys.has(segKey(...this.chords[g])));
    if (!fresh) return { ok: false, code: 'dup', text: 'Эта прямая уже проведена ✔️', ptFaces: {} };
    const [F, g] = fresh;
    const refName = this.segLabel(st0, S);
    const st = copyState(st0);
    const { added, seg, dashed } = this.drawChord(st, g, this.namePools(st0));
    let text = `✅ Грани <b>${poly.faceTitle(F)}</b> и <b>${poly.faceTitle(g)}</b> параллельны. Плоскость сечения пересекает параллельные плоскости по параллельным прямым. Поэтому через <b>${pretty(P.name)}</b> проводим прямую, параллельную <b>${refName}</b>.`;
    text += this.newPointsText(added);
    return { ok: true, st, step: { kind: 'parallel', face: g, seg, added, dashed, faces: [F, g], text, via: [P.name] } };
  }

  // ---- действие 3: продлить отрезок до пересечения с прямой ребра
  extend(st0, segIdx, edge) {
    const poly = this.poly;
    const S = st0.segs[segIdx];
    const [a, b] = edge;
    const ek = Poly.ekey(a, b);
    const efaces = poly.edgeFaces[ek] || [];
    const F = [...S.faces].find((f) => efaces.includes(f));
    if (!F) {
      return {
        ok: false, code: 'skew',
        text: `Отрезок лежит в грани ${[...S.faces].map((f) => poly.faceTitle(f)).join(' / ')}, а ребро <b>${pretty(a)}${pretty(b)}</b> — не в ней. Прямые лежат в разных плоскостях и точку пересечения для следа не дадут.`,
        segFaces: [...S.faces], edge,
      };
    }
    const G = efaces.find((f) => f !== F);
    const X = lineIntersection(S.p, S.q, poly.verts[a], poly.verts[b]);
    if (!X) return { ok: false, code: 'parallelEdge', text: `Отрезок параллелен ребру <b>${pretty(a)}${pretty(b)}</b> — пересечения нет, точку для следа не получить.`, segFaces: [F], edge };
    if (this.ptAt(st0, X)) return { ok: false, code: 'known', text: 'Эта точка уже отмечена ✔️', segFaces: [F], edge };
    if (V.dist(X, poly.center) > MAX_AUX_DIST) return { ok: false, code: 'far', text: 'Точка пересечения слишком далеко — попробуй другое ребро.', segFaces: [F], edge };
    const st = copyState(st0);
    const pools = this.namePools(st0);
    const name = pools.aux.shift();
    const kp = this.makeKP(name, X, 'aux');
    const nearC = V.dist(S.p, X) < V.dist(S.q, X) ? S.p : S.q;
    const nearE = V.dist(poly.verts[a], X) < V.dist(poly.verts[b], X) ? poly.verts[a] : poly.verts[b];
    const dashed = [{ p: nearC, q: X, style: 'ext' }, { p: nearE, q: X, style: 'edge' }];
    st.pts.set(name, kp);
    st.dashed.push(...dashed);
    const line = this.segLabel(st0, S) || 'отрезок';
    const en = pretty(a) + pretty(b);
    const text = `✅ Продолжаем прямую <b>${line}</b> (она лежит в грани ${poly.faceTitle(F)}) до пересечения с прямой <b>${en}</b>.\nТочка <b>${pretty(name)}</b> лежит и на прямой ${line} — значит, в плоскости сечения, и на прямой ${en} — значит, в плоскости грани ${poly.faceTitle(G)}.`;
    return { ok: true, st, step: { kind: 'extend', face: F, seg: null, added: [kp], dashed, faces: [F, G], text, via: [] } };
  }

  // ---- подсказки: какие шаги сейчас возможны
  suggest(st) {
    const poly = this.poly;
    const acts = [];
    for (const [f, [p, q]] of Object.entries(this.chords)) {
      if (st.drawnFaces.has(f) || st.drawnKeys.has(segKey(p, q))) continue;
      const ks = this.knownInPlane(st, f);
      if (ks.length >= 2) {
        const [a, b] = this.bestPair(ks);
        acts.push({ kind: 'connect', a: a.name, b: b.name, face: f });
      }
    }
    for (const f of [...st.drawnFaces].sort()) {
      const g = poly.parallel[f];
      if (!g || !this.chords[g]) continue;
      if (st.drawnFaces.has(g) || st.drawnKeys.has(segKey(...this.chords[g]))) continue;
      const ks = this.knownInPlane(st, g);
      const si = this.segIndexOfFace(st, f);
      if (ks.length === 1 && si >= 0 && !acts.some((x) => x.face === g)) {
        acts.push({ kind: 'parallel', point: ks[0].name, seg: si, face: g, ref: f });
      }
    }
    if (!acts.length && !this.complete(st)) acts.push(...this.extendPlan(st));
    const rank = { connect: 3, parallel: 2, extend: 1 };
    acts.sort((x, y) => rank[y.kind] - rank[x.kind] || ((x.face || '') < (y.face || '') ? -1 : (x.face || '') > (y.face || '') ? 1 : 0));
    return acts;
  }
  extendPlan(st) {
    const poly = this.poly;
    let best = null;
    for (const G of Object.keys(this.chords)) {
      if (st.drawnFaces.has(G) || st.drawnKeys.has(segKey(...this.chords[G]))) continue;
      const need = 2 - this.knownInPlane(st, G).length;
      if (need <= 0) continue;
      const cands = [];
      for (const [a, b] of poly.faceEdges(G)) {
        const F = poly.otherFace(a, b, G);
        if (!F || !st.drawnFaces.has(F) || !this.chords[F]) continue;
        const si = this.segIndexOfFace(st, F);
        if (si < 0) continue;
        const X = lineIntersection(this.chords[F][0], this.chords[F][1], poly.verts[a], poly.verts[b]);
        if (!X || this.ptAt(st, X) || V.dist(X, poly.center) > MAX_AUX_DIST) continue;
        if (cands.some((c) => same(c.X, X))) continue;
        cands.push({ X, act: { kind: 'extend', seg: si, edge: [a, b], face: F, target: G } });
      }
      if (cands.length < need) continue;
      cands.sort((x, y) => V.dist(x.X, poly.center) - V.dist(y.X, poly.center));
      const chosen = cands.slice(0, need);
      const score = [need, chosen.reduce((s, c) => s + V.dist(c.X, poly.center), 0)];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
        best = { score, acts: chosen.map((c) => c.act) };
      }
    }
    return best ? best.acts : [];
  }
  apply(st, act) {
    if (act.kind === 'connect') return this.connect(st, act.a, act.b);
    if (act.kind === 'parallel') return this.parallel(st, act.point, act.seg);
    return this.extend(st, act.seg, act.edge);
  }
  solve(limit = 30) {
    let st = this.initialState();
    const steps = [];
    for (let i = 0; i < limit && !this.complete(st); i++) {
      const acts = this.suggest(st);
      if (!acts.length) throw new Error('решатель застрял');
      const r = this.apply(st, acts[0]);
      if (!r.ok) throw new Error('шаг не удался: ' + r.code);
      steps.push({ act: acts[0], step: r.step });
      st = r.st;
    }
    return { st, steps };
  }
  polygonNames(st) {
    return this.polygon.map((p) => (this.ptAt(st, p) || { name: '?' }).name);
  }
  hintText(act, st) {
    const poly = this.poly;
    if (act.kind === 'connect') return `В грани ${poly.faceTitle(act.face)} уже есть две точки — ${pretty(act.a)} и ${pretty(act.b)}. Соедини их.`;
    if (act.kind === 'parallel') return `Грани ${poly.faceTitle(act.ref)} и ${poly.faceTitle(act.face)} параллельны. Выбери точку ${pretty(act.point)} и подсвеченный отрезок — получится параллельная прямая.`;
    const [a, b] = act.edge;
    return `Точки в одной грани закончились. Выбери подсвеченный отрезок и ребро ${pretty(a)}${pretty(b)} — его продолжение даст точку следа.`;
  }
}

// ---------------------------------------------------------------- тренажёр
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const MAX_SIDES = { cube: 6, prism: 5, pyramid: 5, tetra: 4 };
const QUIZ_SHAPES = ['cube', 'cube', 'prism', 'pyramid', 'tetra'];

export function describeEdgePoint(name, a, b, t) {
  const fr = bestFraction(t);
  const e = pretty(a) + pretty(b);
  if (fr[0] * 2 === fr[1]) return `<b>${name}</b> — середина ребра ${e}`;
  return `<b>${name}</b> ∈ ${e}, ${pretty(a)}${name} : ${name}${pretty(b)} = ${fr[0]} : ${fr[1] - fr[0]}`;
}
export function bestFraction(t) {
  for (let d = 1; d <= 6; d++) {
    const n = Math.round(t * d);
    if (Math.abs(n / d - t) < 1e-9) return [n, d];
  }
  return [Math.round(t * 100), 100];
}

export function makeQuiz(shapes, rng) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const target = pick([3, 4, 4, 5, 5, 6]);
  let fallback = null;
  for (let it = 0; it < 600; it++) {
    const key = pick(QUIZ_SHAPES);
    if (target > MAX_SIDES[key]) continue;
    const poly = new Poly(shapes[key]);
    const edges = [...poly.edges];
    const chosen = [];
    while (chosen.length < 3) {
      const e = pick(edges);
      if (!chosen.includes(e)) chosen.push(e);
    }
    const ts = chosen.map(() => pick([1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]));
    const pts = chosen.map(([a, b], i) => V.lerp(poly.verts[a], poly.verts[b], ts[i]));
    let plane;
    try { plane = planeFrom(...pts); } catch { continue; }
    const polygon = poly.sectionPolygon(plane);
    if (polygon.length < 3) continue;
    if (Object.keys(poly.faces).some((f) => Math.abs(Math.abs(V.dot(plane.n, poly.faceN[f])) - 1) < 1e-6 && Math.abs(Math.abs(plane.d) - Math.abs(poly.faceD[f])) < 1e-6)) continue;
    const q = { shape: key, edges: chosen, ts, pts, n: polygon.length, kind: classify(polygon) };
    if (polygon.length === target) return q;
    fallback = fallback || q;
  }
  return fallback;
}
