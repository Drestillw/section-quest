// Достижения и награды (общая логика для экранов).
import { LEVELS } from './data.js';
import { S, save } from './store.js';
import { ACH } from './content.js';
import { toast } from './ui.js';

export function checkAch(extra = []) {
  const st = S.d.stars, want = new Set(extra);
  const got = (id) => (st[id] || 0) > 0;
  if (Object.values(st).some((v) => v > 0)) want.add('first');
  if (Object.values(st).some((v) => v === 3)) want.add('perfect');
  if (got(5)) want.add('tracer');
  if (got(7)) want.add('hexagon');
  const world = (w) => LEVELS.filter((l) => l.world === w).every((l) => got(l.id));
  if (world(1) && world(2)) want.add('world1');
  if (world(3)) want.add('world3');
  if (world(4)) want.add('world4');
  if (S.d.lessons.length >= 5) want.add('student');
  if (S.d.quiz.ok >= 5) want.add('quiz5');
  if (S.d.quiz.best >= 5) want.add('streak5');
  if (LEVELS.every((l) => got(l.id))) want.add('all');
  if (LEVELS.every((l) => st[l.id] === 3)) want.add('allstars');
  const fresh = [...want].filter((k) => ACH[k] && !S.d.ach.includes(k));
  if (fresh.length) { S.d.ach.push(...fresh); save(); }
  return fresh;
}
export function announce(fresh) {
  fresh.forEach((k, i) => setTimeout(() => toast(`${ACH[k][0]} Достижение: <b>${ACH[k][1]}</b>`, 'ach', 3000), 600 + i * 3200));
}
