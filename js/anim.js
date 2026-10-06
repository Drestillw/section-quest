// Общие анимации шагов построения (уроки, песочница и т.п.).
import { COL } from './scene.js';

export function animateStep(sc, step, base = 0) {
  sc.highlightFaces(step.faces, { color: COL.pink, hold: 1.0 });
  if (step.kind === 'extend') {
    sc.addDashed(step.dashed[0], { delay: base + 0.1, duration: 0.6 });
    sc.addDashed(step.dashed[1], { delay: base + 0.35, duration: 0.6 });
    step.added.forEach((kp) => sc.addPoint(kp, { delay: base + 0.95 }));
  } else {
    step.dashed.forEach((d) => sc.addDashed(d, { delay: base + 0.1, duration: 0.7 }));
    sc.addSegment(step.seg, { delay: base + 0.15, duration: 0.8 });
    step.added.forEach((kp) => {
      const near = Math.hypot(kp.p[0] - step.seg.p[0], kp.p[1] - step.seg.p[1], kp.p[2] - step.seg.p[2]) < 1e-6;
      sc.addPoint(kp, { delay: base + (near ? 0.15 : 0.95) });
    });
  }
}
export function rebuild(sc, st) {
  sc.clearDynamic();
  for (const kp of st.pts.values()) sc.addPoint(kp, { animate: false });
  st.segs.forEach((s) => sc.addSegment(s, { animate: false }));
  st.dashed.forEach((d) => sc.addDashed(d, { animate: false }));
}
