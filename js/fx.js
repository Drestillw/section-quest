// Звуки (синтез через WebAudio) и вибро-отклик.
import { TG } from './tg.js';
let ctx = null;
export const FX = { enabled: true };
function ac() {
  if (!FX.enabled) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(freq, t0, dur, { type = 'sine', gain = 0.12, slide = 0 } = {}) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, a.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.05);
}
export const sfx = {
  tap() { tone(660, 0, 0.07, { type: 'triangle', gain: 0.07 }); },
  select() { tone(880, 0, 0.09, { type: 'sine', gain: 0.09 }); TG.select(); },
  good() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.22, { gain: 0.1 })); TG.impact('medium'); },
  draw() { tone(300, 0, 0.55, { type: 'sine', gain: 0.05, slide: 3 }); },
  bad() { tone(190, 0, 0.22, { type: 'sawtooth', gain: 0.06, slide: 0.7 }); TG.notify('error'); },
  soft() { tone(420, 0, 0.12, { type: 'sine', gain: 0.06 }); TG.impact('light'); },
  hint() { [740, 988].forEach((f, i) => tone(f, i * 0.09, 0.2, { gain: 0.07 })); TG.impact('light'); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.4, { gain: 0.1 })); TG.notify('success'); },
  star(i) { tone(880 * (1 + i * 0.25), 0, 0.3, { gain: 0.1 }); TG.impact('medium'); },
};
