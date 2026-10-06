// 3D-сцена: стеклянный многогранник, неоновое сечение, точки, подписи, частицы, касания.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { V, splitLabel, pretty } from './engine.js';

export const COL = {
  edge: 0xdee7ff, hidden: 0x8590d0, face: 0x92a8ff,
  pink: 0xff54a8, pinkLight: 0xffcde8, violet: 0x9668ff,
  gold: 0xffd662, cyan: 0x58e2ff, orange: 0xffa046, white: 0xffffff, red: 0xff5a6e,
};
const ease = { out: (x) => 1 - (1 - x) ** 3, io: (x) => (x * x * (3 - 2 * x)), back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; } };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- текстуры
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    glow: canvasTex(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    }),
    dot: canvasTex(64, (g, s) => {
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    }),
    ring: canvasTex(128, (g, s) => {
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
      g.lineWidth = s * 0.06; g.strokeStyle = '#fff'; g.stroke();
    }),
    star: canvasTex(64, (g, s) => {
      g.translate(s / 2, s / 2); g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, r = i % 2 ? s * 0.09 : s * 0.46;
        g.lineTo(Math.cos(a - Math.PI / 2) * r, Math.sin(a - Math.PI / 2) * r);
      }
      g.closePath(); g.fill();
    }),
  };
  return TEX;
}

// ---------------------------------------------------------------- неоновая линия
class NeonLine {
  /** layers: [{width(CSS px), color, opacity, dashed}] — рисуются поверх друг друга.
   *  Один сегмент (без «бусин» на стыках прозрачных слоёв); анимация — движением конца. */
  constructor(scene, p, q, layers, renderOrder = 3) {
    this.scene = scene;
    this.p = p; this.q = q;
    this.geo = new LineGeometry();
    this.geo.setPositions([p.x, p.y, p.z, q.x, q.y, q.z]);
    this.layers = layers.map((L) => {
      const m = new LineMaterial({
        color: L.color, linewidth: L.width, transparent: true, opacity: L.opacity,
        depthTest: false, depthWrite: false, dashed: !!L.dashed, dashSize: L.dash ?? 0.06, gapSize: L.gap ?? 0.045,
      });
      m.resolution.set(scene.w || 1, scene.h || 1);
      scene.lineMats.add(m);
      if (L.additive) m.blending = THREE.AdditiveBlending;
      const line = new Line2(this.geo, m);
      line.computeLineDistances();
      line.frustumCulled = false;
      line.renderOrder = renderOrder;
      line.userData.base = L;
      return line;
    });
    this.object = new THREE.Group();
    this.layers.forEach((l) => this.object.add(l));
    this.progress = 1;
  }
  setProgress(t) {
    t = Math.max(0.002, Math.min(1, t));
    if (t === this.progress) return;
    this.progress = t;
    const e = this.p.clone().lerp(this.q, t);
    this.geo.dispose();
    this.geo.setPositions([this.p.x, this.p.y, this.p.z, e.x, e.y, e.z]);
    for (const l of this.layers) if (l.material.dashed) l.computeLineDistances();
  }
  setEnds(p, q) {
    this.p = p; this.q = q; this.progress = 1;
    this.geo.dispose();
    this.geo.setPositions([p.x, p.y, p.z, q.x, q.y, q.z]);
    for (const l of this.layers) if (l.material.dashed) l.computeLineDistances();
  }
  tipPos(t) { return this.p.clone().lerp(this.q, t); }
  setOpacityMul(m) { this.layers.forEach((l) => { l.material.opacity = l.userData.base.opacity * m; }); }
  setWidthMul(m) { this.layers.forEach((l) => { l.material.linewidth = l.userData.base.width * m; }); }
  setColor(c) { this.layers.forEach((l) => l.material.color.setHex(c)); }
  dispose() {
    this.object.removeFromParent();
    this.geo.dispose();
    this.layers.forEach((l) => { this.scene.lineMats.delete(l.material); l.material.dispose(); });
  }
}

const SOLID_EDGE = [
  { width: 7, color: COL.edge, opacity: 0.10, additive: true },
  { width: 2.0, color: COL.edge, opacity: 0.95 },
];
const HIDDEN_EDGE = [{ width: 1.3, color: COL.hidden, opacity: 0.8, dashed: true }];
const SEG_VISIBLE = [
  { width: 15, color: COL.pink, opacity: 0.20, additive: true },
  { width: 5.2, color: COL.pink, opacity: 0.95 },
  { width: 1.9, color: COL.pinkLight, opacity: 1 },
];
const SEG_HIDDEN = [
  { width: 10, color: COL.pink, opacity: 0.10, additive: true },
  { width: 3, color: COL.pink, opacity: 0.95, dashed: true, dash: 0.07, gap: 0.05 },
];

// ---------------------------------------------------------------- сцена
export class SectionScene {
  constructor(container, opts = {}) {
    this.container = container;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lineMats = new Set();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      container.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;padding:30px;text-align:center;color:#fff">Не удалось запустить 3D 😢<br>Обнови Telegram или открой игру в другом браузере.</div>';
      throw e;
    }
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'gl';
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; location.reload(); });
    container.appendChild(this.canvas);
    this.labelsEl = document.createElement('div');
    this.labelsEl.className = 'labels';
    container.appendChild(this.labelsEl);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.tweens = [];
    this.view = { yaw: -0.42, pitch: 0.38, vyaw: 0, vpitch: 0, zoom: 1, auto: 0 };
    this.focusY = opts.focusY ?? 0.05;            // сдвиг фигуры вверх (под нижнюю панель)
    this.running = false;
    this.frameNo = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.last = performance.now();
    this.items = { pts: new Map(), segs: [], dashed: [], extra: [] };
    this.faceMeshes = {};
    this.edgeObjs = [];
    this.hlAlpha = {};
    this.onTap = null;
    this.idleSince = performance.now();
    this._bindInput();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);
    this._initParticles();
  }

  // ---------- размеры/камера
  _resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    for (const m of this.lineMats) m.resolution.set(w, h);
    this.camera.aspect = w / h;
    this._fitCamera();
  }
  _fitCamera() {
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const aspect = this.camera.aspect;
    const R = this.fitR || 1.2;
    const d = (R * 1.08) / (Math.tan(half) * Math.min(1, aspect));
    this.baseDist = d;
    this.camera.position.set(0, 0, d / this.view.zoom);
    this.camera.near = 0.1; this.camera.far = d * 4;
    this.camera.updateProjectionMatrix();
    this.camera.setViewOffset(this.w, this.h, 0, this.h * this.focusY, this.w, this.h);
  }

  // ---------- загрузка многогранника
  /** poly — Poly из engine.js; fitPts — все точки уровня (чтобы кадр не прыгал) */
  loadPoly(poly, { yaw = -0.42, pitch = 0.38, fitPts = [], minFit = 1 } = {}) {
    this.clearAll();
    this.poly = poly;
    this.center = poly.center;
    let R = 0;
    for (const v of Object.values(poly.verts)) R = Math.max(R, V.dist(v, poly.center));
    this.unit = 1 / R;                                     // фигура вписана в сферу радиуса 1
    let fit = minFit;
    for (const p of fitPts) fit = Math.max(fit, V.dist(p, poly.center) * this.unit);
    this.fitR = Math.min(fit, 2.4) * 1.0 + 0.05;
    this.view.yaw = yaw; this.view.pitch = pitch; this.view.vyaw = 0; this.view.vpitch = 0; this.view.zoom = 1;
    this._fitCamera();
    this._buildSolid();
    this.start();
  }
  p3(p) {
    const c = this.center, u = this.unit;
    return new THREE.Vector3((p[0] - c[0]) * u, (p[2] - c[2]) * u, -(p[1] - c[1]) * u);
  }
  n3(n) { return new THREE.Vector3(n[0], n[2], -n[1]); }

  _buildSolid() {
    const poly = this.poly;
    this.solid = new THREE.Group();
    this.world.add(this.solid);
    this.faceInfo = {};
    for (const [f, names] of Object.entries(poly.faces)) {
      const pts = names.map((n) => this.p3(poly.verts[n]));
      const geo = new THREE.BufferGeometry();
      const arr = [];
      for (let i = 1; i < pts.length - 1; i++) arr.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const mat = new THREE.MeshBasicMaterial({ color: COL.face, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 0;
      const hmat = new THREE.MeshBasicMaterial({ color: COL.pink, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const hmesh = new THREE.Mesh(geo, hmat); hmesh.renderOrder = 1;
      this.solid.add(mesh, hmesh);
      this.faceInfo[f] = { mesh, mat, hmat, n: this.n3(poly.faceN[f]), c: this.p3(V.mean(names.map((n) => poly.verts[n]))), pts };
      this.hlAlpha[f] = 0;
    }
    this.edgeObjs = [];
    for (const [a, b] of poly.edges) {
      const pa = this.p3(poly.verts[a]), pb = this.p3(poly.verts[b]);
      const solid = new NeonLine(this, pa, pb, SOLID_EDGE, 2);
      const dash = new NeonLine(this, pa, pb, HIDDEN_EDGE, 2);
      this.solid.add(solid.object, dash.object);
      this.edgeObjs.push({ a, b, solid, dash, faces: poly.edgeFaces[`${a < b ? a : b}|${a < b ? b : a}`] });
    }
    // вершины: точки + подписи
    this.vertexItems = {};
    for (const [name, v] of Object.entries(poly.verts)) {
      const pos = this.p3(v);
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures().dot, color: 0xeaf0ff, transparent: true, depthTest: false, depthWrite: false }));
      dot.scale.setScalar(0.05); dot.position.copy(pos); dot.renderOrder = 4;
      this.solid.add(dot);
      const el = this._label(name, 'v');
      this.vertexItems[name] = { name, pos, dot, el, faces: new Set(Object.keys(poly.faces).filter((f) => poly.faces[f].includes(name))) };
    }
  }

  _label(name, cls) {
    const [m, s] = splitLabel(name);
    const el = document.createElement('div');
    el.className = `lab ${cls}`;
    el.innerHTML = s ? `${m}<sub>${s}</sub>` : m;
    this.labelsEl.appendChild(el);
    return el;
  }

  // ---------- динамические объекты
  clearDynamic() {
    for (const it of this.items.pts.values()) this._disposePt(it);
    this.items.pts.clear();
    for (const s of this.items.segs) s.line.dispose();
    for (const d of this.items.dashed) d.line.dispose();
    for (const e of this.items.extra) e.dispose?.();
    this.items = { pts: new Map(), segs: [], dashed: [], extra: [] };
    if (this.polyMesh) { this.polyMesh.removeFromParent(); this.polyMesh.geometry.dispose(); this.polyMesh = null; }
    if (this.planeObj) { this.planeObj.group.removeFromParent(); this.planeObj.line.dispose(); this.planeObj = null; }
    if (this.live) { this.live.lines.forEach((l) => l.dispose()); this.live.geo.dispose(); this.live.group.removeFromParent(); this.live = null; }
    for (const f of Object.keys(this.hlAlpha)) this.hlAlpha[f] = 0;
    this.hlJobs = [];
    this.selection = null; this.pulses = [];
    if (this.selRing) { this.selRing.removeFromParent(); this.selRing = null; }
    this.tweens = this.tweens.filter((t) => t.keep);
  }
  clearAll() {
    this.clearDynamic();
    if (this.solid) {
      for (const e of this.edgeObjs) { e.solid.dispose(); e.dash.dispose(); }
      for (const fi of Object.values(this.faceInfo || {})) { fi.mesh.geometry.dispose(); fi.mat.dispose(); fi.hmat.dispose(); }
      this.solid.removeFromParent();
      this.solid = null;
    }
    for (const v of Object.values(this.vertexItems || {})) v.el.remove();
    this.vertexItems = {};
    this.labelsEl.innerHTML = '';
  }
  _disposePt(it) {
    it.group.removeFromParent();
    it.el.remove();
    it.group.traverse((o) => { o.material?.dispose?.(); });
  }

  /** kp: {name, p, kind, inFaces}. opts.delay — задержка появления (сек). */
  addPoint(kp, { animate = true, delay = 0 } = {}) {
    if (this.items.pts.has(kp.name)) this.removePoint(kp.name);
    const col = { given: COL.gold, vertex: COL.gold, section: COL.cyan, aux: COL.orange }[kp.kind] ?? COL.cyan;
    const T = textures();
    const group = new THREE.Group();
    group.position.copy(this.p3(kp.p));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0.9 }));
    halo.scale.setScalar(0.26); halo.renderOrder = 5;
    let core;
    if (kp.kind === 'aux') {
      core = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.ring, color: col, transparent: true, depthTest: false, depthWrite: false }));
      core.scale.setScalar(0.11);
    } else {
      core = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: col, transparent: true, depthTest: false, depthWrite: false }));
      core.scale.setScalar(0.085);
    }
    core.renderOrder = 6;
    const rim = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.ring, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, opacity: kp.kind === 'aux' ? 0 : 0.95 }));
    rim.scale.setScalar(0.095); rim.renderOrder = 7;
    group.add(halo, core, rim);
    this.world.add(group);
    const vk = kp.kind === 'vertex' || this.poly.vertexAt(kp.p);
    const el = this._label(kp.name, kp.kind === 'aux' ? 'aux' : kp.kind === 'section' ? 'sec' : 'giv');
    const it = { kp, group, halo, core, rim, el, col, faces: kp.inFaces, born: performance.now() / 1000 + delay, vertexName: vk ? this.poly.vertexAt(kp.p) : null, appear: animate ? 0 : 1 };
    this.items.pts.set(kp.name, it);
    if (vk) { const vi = this.vertexItems[this.poly.vertexAt(kp.p)]; if (vi) { vi.el.style.display = 'none'; vi.dot.visible = false; } }
    if (animate) {
      group.visible = false; el.style.opacity = 0;
      this.tween({ delay, dur: 0.55, fn: (t) => {
        group.visible = true;
        const s = ease.back(t); it.appear = s;
        group.scale.setScalar(Math.max(0.001, s));
        el.style.opacity = clamp01(t * 1.6);
        if (t === 0) return;
      }, done: () => { it.appear = 1; group.scale.setScalar(1); el.style.opacity = 1; } });
      this.tween({ delay, dur: 0.7, fn: (t) => {
        if (!it.ripple) {
          it.ripple = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.ring, color: col, transparent: true, depthTest: false, depthWrite: false }));
          it.ripple.renderOrder = 6; group.add(it.ripple);
        }
        it.ripple.scale.setScalar(0.1 + 0.5 * ease.out(t));
        it.ripple.material.opacity = (1 - t) * 0.9;
      }, done: () => { if (it.ripple) { group.remove(it.ripple); it.ripple.material.dispose(); it.ripple = null; } } });
      this.tween({ delay, dur: 0.01, fn: () => {}, done: () => this.burst(group.position, 8, { color: col, speed: 0.5, life: 0.6, size: 9 }) });
    }
    return it;
  }
  removePoint(name) {
    const it = this.items.pts.get(name);
    if (!it) return;
    this._disposePt(it);
    this.items.pts.delete(name);
    if (it.vertexName) { const vi = this.vertexItems[it.vertexName]; if (vi) { vi.el.style.display = ''; vi.dot.visible = true; } }
  }

  /** seg: {p, q, faces:Set}. Возвращает объект с line. */
  addSegment(seg, { animate = true, delay = 0, duration = 0.8 } = {}) {
    const a = this.p3(seg.p), b = this.p3(seg.q);
    const vis = new NeonLine(this, a, b, SEG_VISIBLE, 4);
    const hid = new NeonLine(this, a, b, SEG_HIDDEN, 4);
    this.world.add(vis.object, hid.object);
    const item = { seg, vis, hid, a, b, faces: seg.faces, line: { dispose: () => { vis.dispose(); hid.dispose(); } }, sel: 0 };
    this.items.segs.push(item);
    if (animate) {
      vis.setProgress(0.002); hid.setProgress(0.002);
      this.tween({ delay, dur: duration, fn: (t) => {
        const e = ease.out(t);
        vis.setProgress(e); hid.setProgress(e);
        if (t > 0 && t < 1) {
          const tip = vis.tipPos(e);
          this._tip = { pos: tip, t: performance.now() };
          if (Math.random() < 0.85) this.burst(tip, 1, { color: COL.pinkLight, speed: 0.35, life: 0.55, size: 8 });
        }
      }, done: () => { vis.setProgress(1); hid.setProgress(1); this._tip = null; } });
    }
    return item;
  }
  /** d: {p,q,style}. */
  addDashed(d, { animate = true, delay = 0, duration = 0.6 } = {}) {
    const col = d.style === 'edge' ? COL.hidden : COL.cyan;
    const line = new NeonLine(this, this.p3(d.p), this.p3(d.q), [
      { width: 7, color: col, opacity: 0.12, additive: true },
      { width: 2.4, color: col, opacity: 0.95, dashed: true, dash: 0.07, gap: 0.05 },
    ], 3);
    this.world.add(line.object);
    this.items.dashed.push({ d, line });
    if (animate) {
      line.setProgress(0.002);
      this.tween({ delay, dur: duration, fn: (t) => line.setProgress(ease.out(t)), done: () => line.setProgress(1) });
    }
    return line;
  }

  setPolygon(points, { animate = true, delay = 0, duration = 0.9 } = {}) {
    if (this.polyMesh) { this.polyMesh.removeFromParent(); this.polyMesh.geometry.dispose(); this.polyMesh = null; }
    if (!points || points.length < 3) return;
    const pts = points.map((p) => this.p3(p));
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const pos = [], col = [];
    const cc = new THREE.Color(COL.violet), ce = new THREE.Color(COL.pink);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(cc.r, cc.g, cc.b, ce.r, ce.g, ce.b, ce.r, ce.g, ce.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    this.world.add(mesh);
    this.polyMesh = mesh;
    const run = (t) => {
      const e = ease.out(t);
      mat.opacity = 0.62 * e;
      const s = 0.6 + 0.4 * ease.back(t);
      mesh.scale.setScalar(s);
      mesh.position.copy(c.clone().multiplyScalar(1 - s));
    };
    if (animate) { run(0); this.tween({ delay, dur: duration, fn: run, done: () => run(1) }); } else run(1);
  }

  /** «Живой» многоугольник (песочница, заставка): перерисовывается каждый кадр без аллокаций сцены. */
  setLivePolygon(points) {
    if (!this.live) {
      const MAXT = 8;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXT * 9), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXT * 9), 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; mesh.frustumCulled = false;
      const group = new THREE.Group();
      group.add(mesh);
      this.world.add(group);
      this.live = { geo, mesh, group, lines: [] };
    }
    const L = this.live;
    if (!points || points.length < 3) { L.group.visible = false; return; }
    L.group.visible = true;
    const pts = points.map((p) => this.p3(p));
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const pos = L.geo.attributes.position.array, col = L.geo.attributes.color.array;
    const cc = new THREE.Color(COL.violet), ce = new THREE.Color(COL.pink);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      pos.set([c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z], i * 9);
      col.set([cc.r, cc.g, cc.b, ce.r, ce.g, ce.b, ce.r, ce.g, ce.b], i * 9);
      if (!L.lines[i]) {
        L.lines[i] = new NeonLine(this, a, b, SEG_VISIBLE, 4);
        L.group.add(L.lines[i].object);
      } else L.lines[i].setEnds(a, b);
      L.lines[i].object.visible = true;
    }
    for (let i = n; i < L.lines.length; i++) L.lines[i].object.visible = false;
    L.geo.setDrawRange(0, n * 3);
    L.geo.attributes.position.needsUpdate = true; L.geo.attributes.color.needsUpdate = true;
  }
  movePoint(name, p) {
    const it = this.items.pts.get(name);
    if (!it) return;
    it.kp = { ...it.kp, p };
    it.group.position.copy(this.p3(p));
  }
  /** сдвиг «стеклянной» плоскости вдоль нормали (в единицах исходных координат) */
  movePlane(plane, delta) {
    if (!this.planeObj) return;
    this.planeObj.group.position.copy(this.n3(plane.n).multiplyScalar(delta * this.unit));
  }

  showPlane(plane, { center = null, size = 1.12, instant = false } = {}) {
    if (this.planeObj) { this.planeObj.group.removeFromParent(); this.planeObj.line.dispose(); this.planeObj = null; }
    const n = plane.n;
    let a = V.cross(n, [0, 0, 1]);
    if (V.len(a) < 1e-6) a = V.cross(n, [1, 0, 0]);
    a = V.norm(a);
    const b = V.cross(n, a);
    const pc = center || V.sub(this.poly.center, V.mul(n, V.dot(n, this.poly.center) - plane.d));
    const R = size / this.unit;
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => V.add(pc, V.add(V.mul(a, R * sx), V.mul(b, R * sy))));
    const v3 = cs.map((p) => this.p3(p));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([v3[0], v3[1], v3[2], v3[0], v3[2], v3[3]].flatMap((v) => [v.x, v.y, v.z]), 3));
    const mat = new THREE.MeshBasicMaterial({ color: COL.violet, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 0;
    const loop = [...v3, v3[0]];
    // рамка из 4 отрезков
    const frame = new THREE.Group();
    const edges = [];
    for (let i = 0; i < 4; i++) {
      const e = new NeonLine(this, v3[i], v3[(i + 1) % 4], [{ width: 8, color: COL.violet, opacity: 0, additive: true }, { width: 1.6, color: 0xc8aaff, opacity: 0 }], 0);
      frame.add(e.object); edges.push(e);
    }
    const group = new THREE.Group();
    group.add(mesh, frame);
    this.world.add(group);
    this.planeObj = { group, mat, edges, line: { dispose: () => { geo.dispose(); mat.dispose(); edges.forEach((e) => e.dispose()); } } };
    const setA = (e) => {
      mat.opacity = 0.16 * e;
      edges.forEach((ed) => { ed.layers[0].material.opacity = 0.18 * e; ed.layers[1].material.opacity = 0.9 * e; });
    };
    if (instant) setA(1); else this.tween({ dur: 0.7, fn: (t) => setA(ease.out(t)) });
  }

  // ---------- подсветка граней
  highlightFaces(faces, { color = COL.pink, hold = 1.1, strength = 0.32 } = {}) {
    for (const f of faces) {
      const fi = this.faceInfo[f];
      if (!fi) continue;
      fi.hmat.color.setHex(color);
      const start = this.hlAlpha[f];
      this.tween({ dur: 0.3 + hold + 0.5, fn: (t) => {
        const T = 0.3 + hold + 0.5, x = t * T;
        const a = x < 0.3 ? x / 0.3 : x < 0.3 + hold ? 1 : 1 - (x - 0.3 - hold) / 0.5;
        const pulse = 0.78 + 0.22 * Math.sin(x * 9);
        this.hlAlpha[f] = Math.max(0, a * strength * pulse);
      }, done: () => { this.hlAlpha[f] = 0; } });
    }
  }

  // ---------- выбор / подсказки
  select(ref) {
    this.selection = ref;
    this._updateSelRing();
  }
  clearSelection() { this.selection = null; this._updateSelRing(); }
  _updateSelRing() {
    if (this.selRing) { this.selRing.removeFromParent(); this.selRing = null; }
    const s = this.selection;
    if (!s) return;
    if (s.kind === 'point' || s.kind === 'vertex') {
      const pos = s.kind === 'point' ? this.items.pts.get(s.id)?.group.position : this.vertexItems[s.id]?.pos;
      if (!pos) return;
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures().ring, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }));
      ring.position.copy(pos); ring.renderOrder = 8;
      this.world.add(ring);
      this.selRing = ring;
    }
  }
  /** Подсветить объекты (подсказка/ошибка). */
  pulse(refs, { color = COL.gold, ms = 1800 } = {}) {
    this.pulses = (this.pulses || []).filter((p) => p.until > performance.now());
    for (const r of refs) this.pulses.push({ ref: r, color, until: performance.now() + ms, from: performance.now() });
  }

  // ---------- эффекты
  shake() {
    const t0 = performance.now();
    this.tween({ dur: 0.45, fn: (t) => { this.world.position.x = Math.sin(t * 38) * 0.05 * (1 - t); }, done: () => { this.world.position.x = 0; } });
  }
  tween(o) { o.t0 = performance.now() / 1000 + (o.delay || 0); this.tweens.push(o); return o; }

  _initParticles() {
    const N = 700;
    this.P = { N, pos: new Float32Array(N * 3), col: new Float32Array(N * 3), size: new Float32Array(N), alpha: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), i: 0 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.P.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.P.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.P.alpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: textures().star }, uPx: { value: this.dpr } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uPx; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uPx; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uMap, gl_PointCoord); gl_FragColor=vec4(vC*t.rgb, t.a*vA); }',
    });
    this.particles = new THREE.Points(g, m);
    this.particles.frustumCulled = false; this.particles.renderOrder = 10;
    this.scene.add(this.particles);
    this._pgeo = g;
  }
  /** pos — локальная позиция в world (THREE.Vector3). */
  burst(pos, n, { color = COL.pink, speed = 1, life = 1, size = 10, gravity = 0, spread = 1, rainbow = false } = {}) {
    const P = this.P;
    const wp = pos.clone();
    this.world.localToWorld(wp);
    const cols = [COL.pink, COL.gold, COL.cyan, COL.violet, 0xffffff];
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.N;
      P.pos.set([wp.x, wp.y, wp.z], i * 3);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.4 + Math.random()) * spread;
      P.vel.set([Math.sin(ph) * Math.cos(th) * sp, Math.sin(ph) * Math.sin(th) * sp, Math.cos(ph) * sp * 0.5], i * 3);
      const c = new THREE.Color(rainbow ? cols[(Math.random() * cols.length) | 0] : color);
      P.col.set([c.r, c.g, c.b], i * 3);
      P.size[i] = size * (0.6 + Math.random() * 0.9);
      P.life[i] = P.max[i] = life * (0.6 + Math.random() * 0.6);
      P.grav[i] = gravity;
    }
  }
  confetti(origin = new THREE.Vector3(0, 0, 0)) {
    this.burst(origin, 90, { speed: 1.6, life: 1.6, size: 13, gravity: 1.2, rainbow: true });
    this.tween({ delay: 0.25, dur: 0.01, fn: () => {}, done: () => this.burst(origin, 70, { speed: 1.2, life: 1.8, size: 11, gravity: 1.0, rainbow: true }) });
  }
  _stepParticles(dt) {
    const P = this.P;
    for (let i = 0; i < P.N; i++) {
      if (P.life[i] <= 0) { P.alpha[i] = 0; continue; }
      P.life[i] -= dt;
      P.vel[i * 3 + 1] -= P.grav[i] * dt;
      for (let k = 0; k < 3; k++) P.pos[i * 3 + k] += P.vel[i * 3 + k] * dt;
      P.vel[i * 3] *= 0.985; P.vel[i * 3 + 1] *= 0.985; P.vel[i * 3 + 2] *= 0.985;
      P.alpha[i] = Math.max(0, Math.min(1, P.life[i] / P.max[i] * 1.6));
    }
    const g = this._pgeo;
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  }

  // ---------- проекция и выбор
  _computePM() {
    this.camera.updateMatrixWorld();
    this.world.updateMatrixWorld(true);
    this._pm = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).multiply(this.world.matrixWorld);
    this._pmStamp = this.frameNo;
  }
  /** engine-координата (или локальный Vector3 при local=true) → CSS-пиксели относительно сцены */
  project(p, local = false) {
    if (!this._pm || this._pmStamp !== this.frameNo) this._computePM();
    const v = local ? p.clone() : this.p3(p);
    v.applyMatrix4(this._pm);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }
  _projLocal(v3) { return this.project(v3, true); }

  facingOf(faceSet) {
    if (!faceSet || !faceSet.size) return true;
    for (const f of faceSet) if (this.faceFront?.[f]) return true;
    return false;
  }

  pick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    const touch = this._touch ? 1.25 : 1;
    let best = null;
    const consider = (kind, id, d, tier, lim) => {
      if (d > lim * touch) return;
      const score = tier * 1000 + d;
      if (!best || score < best.score) best = { kind, id, score, d };
    };
    for (const [name, it] of this.items.pts) {
      const s = this._projLocal(it.group.position);
      consider('point', name, Math.hypot(s.x - x, s.y - y), 0, 30);
    }
    for (const [name, vi] of Object.entries(this.vertexItems)) {
      if (this.items.pts.has(this._ptNameOfVertex(name))) continue;
      const s = this._projLocal(vi.pos);
      consider('vertex', name, Math.hypot(s.x - x, s.y - y), 1, 26);
    }
    this.items.segs.forEach((sg, idx) => {
      const A = this._projLocal(sg.a), B = this._projLocal(sg.b);
      consider('seg', idx, distToSeg(x, y, A.x, A.y, B.x, B.y), 2, 17);
    });
    for (const e of this.edgeObjs) {
      const A = this._projLocal(this.p3(this.poly.verts[e.a])), B = this._projLocal(this.p3(this.poly.verts[e.b]));
      consider('edge', [e.a, e.b], distToSeg(x, y, A.x, A.y, B.x, B.y), 3, 15);
    }
    return best;
  }
  _ptNameOfVertex(vname) {
    for (const [n, it] of this.items.pts) if (it.vertexName === vname) return n;
    return null;
  }

  // ---------- ввод
  _bindInput() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    const ptrs = new Map();
    let moved = 0, downT = 0, startX = 0, startY = 0, pinch0 = 0, zoom0 = 1;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this._touch = e.pointerType === 'touch';
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { moved = 0; downT = performance.now(); startX = e.clientX; startY = e.clientY; this.view.vyaw = this.view.vpitch = 0; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.view.zoom; }
      this.idleSince = performance.now();
      this.dragHook?.('down', e);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) { this.dragHook?.('hover', e); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.idleSince = performance.now();
      if (this.dragHook?.('move', e, ptrs.size)) return;
      if (ptrs.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        this.view.yaw += dx * 0.0085; this.view.pitch = Math.max(-1.35, Math.min(1.35, this.view.pitch + dy * 0.0085));
        this.view.vyaw = dx * 0.0085 * 60; this.view.vpitch = dy * 0.0085 * 60;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.view.zoom = Math.max(0.6, Math.min(1.9, zoom0 * d / pinch0));
        this._applyZoom();
        moved += 99;
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const wasOne = ptrs.size === 1;
      ptrs.delete(e.pointerId);
      const consumed = this.dragHook?.('up', e);
      if (wasOne && !consumed && moved < 9 && performance.now() - downT < 450) {
        this.view.vyaw = this.view.vpitch = 0;
        this.onTap?.(this.pick(e.clientX, e.clientY), e);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.view.zoom = Math.max(0.6, Math.min(1.9, this.view.zoom * (e.deltaY < 0 ? 1.08 : 0.92))); this._applyZoom(); }, { passive: false });
  }
  _applyZoom() { this.camera.position.z = this.baseDist / this.view.zoom; }
  setView(yaw, pitch, animate = true) {
    if (!animate) { this.view.yaw = yaw; this.view.pitch = pitch; return; }
    const y0 = this.view.yaw, p0 = this.view.pitch, z0 = this.view.zoom;
    // кратчайший путь по углу
    let dy = ((yaw - y0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    this.view.vyaw = this.view.vpitch = 0;
    this.tween({ dur: 0.7, fn: (t) => { const e = ease.io(t); this.view.yaw = y0 + dy * e; this.view.pitch = p0 + (pitch - p0) * e; this.view.zoom = z0 + (1 - z0) * e; this._applyZoom(); } });
  }
  setAutoRotate(speed) { this.view.auto = speed; }

  // ---------- цикл
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this._frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  _frame(now) {
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.frameNo++;
    // адаптивное качество: если телефон не тянет — уменьшаем разрешение
    if (raw < 0.5) { this.fpsAcc += raw; this.fpsN++; }
    if (this.fpsN >= 70) {
      const avg = this.fpsAcc / this.fpsN;
      this.fpsAcc = 0; this.fpsN = 0;
      if (avg > 0.030 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.5);
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.setSize(this.w, this.h, false);
        this.particles.material.uniforms.uPx.value = this.dpr;
      }
    }
    const t = now / 1000;
    // tweens
    for (const tw of this.tweens) {
      if (tw.dead) continue;
      if (t < tw.t0) continue;
      const k = tw.dur > 0 ? clamp01((t - tw.t0) / tw.dur) : 1;
      tw.fn(k);
      if (k >= 1) { tw.dead = true; tw.done?.(); }
    }
    this.tweens = this.tweens.filter((x) => !x.dead);
    // вращение с инерцией
    const v = this.view;
    const idle = (now - this.idleSince) / 1000;
    if (Math.abs(v.vyaw) > 0.001 || Math.abs(v.vpitch) > 0.001) {
      v.yaw += v.vyaw * dt; v.pitch = Math.max(-1.35, Math.min(1.35, v.pitch + v.vpitch * dt));
      const k = Math.pow(0.04, dt);
      v.vyaw *= k; v.vpitch *= k;
    } else if (v.auto && idle > 0.2) {
      v.yaw += v.auto * dt;
    }
    this.world.rotation.set(v.pitch, v.yaw, 0, 'XYZ');
    this._computePM();
    this._updateFacing(t);
    this._stepParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this._updateLabels();
  }
  _updateFacing(t) {
    const camPos = this.camera.position;
    this.faceFront = {};
    const q = this.world.quaternion;
    const light = new THREE.Vector3(-0.35, 0.75, 0.55).normalize();
    for (const [f, fi] of Object.entries(this.faceInfo)) {
      const nW = fi.n.clone().applyQuaternion(q);
      const cW = fi.c.clone().applyMatrix4(this.world.matrixWorld);
      const front = nW.dot(camPos.clone().sub(cW)) > 0;
      this.faceFront[f] = front;
      const lum = Math.max(0, nW.dot(light));
      fi.mat.opacity = front ? 0.10 + 0.17 * lum : 0.045;
      fi.hmat.opacity = this.hlAlpha[f] || 0;
    }
    for (const e of this.edgeObjs) {
      const vis = e.faces.some((f) => this.faceFront[f]);
      e.solid.object.visible = vis; e.dash.object.visible = !vis;
    }
    for (const sg of this.items.segs) {
      const vis = this.facingOf(sg.faces);
      sg.vis.object.visible = vis; sg.hid.object.visible = !vis;
    }
    for (const it of this.items.pts.values()) {
      const vis = this.facingOf(it.faces);
      it.vis = vis;
      const k = vis ? 1 : 0.5;
      it.halo.material.opacity = 0.9 * k;
      it.core.material.opacity = k;
    }
    for (const vi of Object.values(this.vertexItems)) {
      vi.vis = [...vi.faces].some((f) => this.faceFront[f]);
      vi.dot.material.opacity = vi.vis ? 1 : 0.45;
    }
    // пульсации (подсказки/ошибки) и выбранный элемент
    const now = performance.now();
    for (const sg of this.items.segs) { sg.vis.setWidthMul(1); sg.hid.setWidthMul(1); sg.vis.layers.forEach((l, i) => l.material.color.setHex(i === 2 ? COL.pinkLight : COL.pink)); }
    for (const e of this.edgeObjs) { e.solid.setWidthMul(1); e.solid.setColor(COL.edge); }
    for (const it of this.items.pts.values()) { it.halo.scale.setScalar(0.26 * (1 + 0.04 * Math.sin(t * 3 + it.kp.p[0] * 5))); }
    const marks = [...(this.pulses || []).filter((p) => p.until > now).map((p) => ({ ...p, a: Math.min(1, (p.until - now) / 400) * (0.5 + 0.5 * Math.sin((now - p.from) / 110)) }))];
    if (this.selection) marks.push({ ref: this.selection, color: COL.white, a: 0.6 + 0.4 * Math.sin(now / 160) });
    for (const m of marks) {
      const r = m.ref;
      if (r.kind === 'seg') {
        const sg = this.items.segs[r.id];
        if (sg) { sg.vis.setWidthMul(1 + 0.9 * m.a); sg.vis.layers[0].material.color.setHex(m.color); sg.vis.layers[1].material.color.setHex(m.color); sg.hid.setWidthMul(1 + 0.8 * m.a); }
      } else if (r.kind === 'edge') {
        const e = this.edgeObjs.find((x) => (x.a === r.id[0] && x.b === r.id[1]) || (x.a === r.id[1] && x.b === r.id[0]));
        if (e) { e.solid.setWidthMul(1 + 1.4 * m.a); e.solid.setColor(m.color); }
      } else if (r.kind === 'point') {
        const it = this.items.pts.get(r.id);
        if (it) { it.halo.scale.setScalar(0.26 + 0.22 * m.a); it.halo.material.color.setHex(m.color); }
      } else if (r.kind === 'vertex') {
        const vi = this.vertexItems[r.id];
        if (vi) vi.dot.scale.setScalar(0.05 + 0.05 * m.a);
      }
    }
    if (this.selRing && this.selection) {
      const s = 0.13 + 0.025 * Math.sin(now / 150);
      this.selRing.scale.setScalar(s);
    }
    // цвет подсветки точек возвращаем, если не пульсирует
    for (const it of this.items.pts.values()) {
      if (!marks.some((m) => m.ref.kind === 'point' && m.ref.id === it.kp.name)) it.halo.material.color.setHex(it.col);
    }
    for (const vi of Object.values(this.vertexItems)) {
      if (!marks.some((m) => m.ref.kind === 'vertex' && m.ref.id === vi.name)) vi.dot.scale.setScalar(0.05);
    }
  }
  _updateLabels() {
    const placed = [];
    const cc = this.project([0, 0, 0].map((_, i) => this.center[i]));
    const items = [];
    for (const it of this.items.pts.values()) items.push({ el: it.el, pos: it.group.position, vis: it.vis !== false, pri: 0 });
    for (const vi of Object.values(this.vertexItems)) if (vi.el.style.display !== 'none') items.push({ el: vi.el, pos: vi.pos, vis: vi.vis !== false, pri: 1 });
    items.sort((a, b) => a.pri - b.pri);
    for (const it of items) {
      const s = this._projLocal(it.pos);
      let dx = s.x - cc.x, dy = s.y - cc.y;
      const len = Math.hypot(dx, dy);
      const base = len > 6 ? Math.atan2(dy, dx) : -Math.PI / 4;
      const off = it.pri ? 17 : 22;
      if (!it.el._bw) { it.el._bw = it.el.offsetWidth; it.el._bh = it.el.offsetHeight; }
      const bw = it.el._bw || 14, bh = it.el._bh || 18;
      let chosen = null;
      for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const a = base + da;
        const x = s.x + Math.cos(a) * off, y = s.y + Math.sin(a) * off;
        const box = [x - bw / 2 - 2, y - bh / 2 - 1, x + bw / 2 + 2, y + bh / 2 + 1];
        if (box[0] < 2 || box[2] > this.w - 2 || box[1] < 2 || box[3] > this.h - 2) continue;
        if (placed.some((p) => !(box[2] < p[0] || p[2] < box[0] || box[3] < p[1] || p[3] < box[1]))) continue;
        chosen = { x, y, box }; break;
      }
      if (!chosen) chosen = { x: s.x + 18, y: s.y - 18, box: [s.x, s.y - 36, s.x + 36, s.y] };
      placed.push(chosen.box);
      it.el.style.transform = `translate3d(${chosen.x - bw / 2}px,${chosen.y - bh / 2}px,0)`;
      it.el.classList.toggle('dim', !it.vis);
    }
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
