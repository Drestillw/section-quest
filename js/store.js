// Прогресс: localStorage + Telegram CloudStorage (синхронизация между устройствами).
import { TG } from './tg.js';
import { FX } from './fx.js';

const KEY = 'sq1';
const blank = () => ({ v: 1, stars: {}, xp: 0, ach: [], lessons: [], quiz: { ok: 0, total: 0, streak: 0, best: 0 }, sound: true, tut: false, day: '', days: 0 });
export const S = { d: blank(), listeners: new Set() };

const RANKS = [[0, 'Новичок', '🌱'], [60, 'Исследователь', '🔍'], [150, 'Геометр', '📐'], [300, 'Мастер сечений', '✂️'], [520, 'Легенда стереометрии', '👑']];
export function rankOf(xp) {
  let i = 0;
  RANKS.forEach((r, k) => { if (xp >= r[0]) i = k; });
  const next = RANKS[i + 1];
  return { name: RANKS[i][1], emoji: RANKS[i][2], idx: i, from: RANKS[i][0], to: next ? next[0] : null, pct: next ? (xp - RANKS[i][0]) / (next[0] - RANKS[i][0]) : 1 };
}

function merge(a, b) { // берём вариант с большим прогрессом
  if (!b) return a;
  const score = (x) => x.xp + Object.values(x.stars || {}).reduce((s, v) => s + v, 0) * 10 + (x.lessons || []).length;
  return score(b) > score(a) ? { ...blank(), ...b } : a;
}

export async function load() {
  try { S.d = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S.d = blank(); }
  FX.enabled = S.d.sound !== false;
  const cloud = await TG.cloudGet(KEY);
  if (cloud) {
    try { S.d = merge(S.d, JSON.parse(cloud)); } catch {}
  }
  const today = new Date().toISOString().slice(0, 10);
  if (S.d.day !== today) {
    const prev = S.d.day ? new Date(S.d.day) : null;
    S.d.days = prev && (new Date(today) - prev) / 864e5 === 1 ? (S.d.days || 0) + 1 : 1;
    S.d.day = today;
    save();
  }
  FX.enabled = S.d.sound !== false;
}
let timer = null;
export function save() {
  const json = JSON.stringify(S.d);
  try { localStorage.setItem(KEY, json); } catch {}
  clearTimeout(timer);
  timer = setTimeout(() => TG.cloudSet(KEY, json), 400);
  S.listeners.forEach((f) => f());
}
export function resetAll() { const sound = S.d.sound; S.d = { ...blank(), sound }; S.d.day = new Date().toISOString().slice(0, 10); S.d.days = 1; save(); }
export const totalStars = () => Object.values(S.d.stars).reduce((s, v) => s + v, 0);
export const levelsDone = () => Object.values(S.d.stars).filter((v) => v > 0).length;
export const unlocked = (id) => id === 1 || (S.d.stars[id - 1] || 0) > 0 || (S.d.stars[id] || 0) > 0;
