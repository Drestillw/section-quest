import { App } from './app.js';
import { TG } from './tg.js';
import { load } from './store.js';
import { bindPress } from './ui.js';
import { Home } from './screens/home.js';
import { MapScreen } from './screens/map.js';
import { LevelScreen } from './screens/level.js';
import { Lessons } from './screens/lessons.js';
import { Sandbox } from './screens/sandbox.js';
import { Quiz } from './screens/quiz.js';
import { ProgressScreen } from './screens/progress.js';

async function boot() {
  TG.init();
  await load();
  App.init();
  bindPress();
  App.register('home', Home); App.register('map', MapScreen); App.register('level', LevelScreen);
  App.register('lessons', Lessons); App.register('sandbox', Sandbox); App.register('quiz', Quiz);
  App.register('progress', ProgressScreen);
  window.App = App;
  const q = new URLSearchParams(location.search);
  const start = q.get('go');
  await App.go(start || 'home', start === 'level' ? { id: +q.get('id') || 1 } : start === 'lessons' ? { i: +q.get('i') || 0 } : {}, { replace: true });
  document.querySelector('.loading')?.classList.add('gone');
  setTimeout(() => document.querySelector('.loading')?.remove(), 700);
  document.body.dataset.ready = '1';
}
boot().catch((e) => { console.error(e); document.body.dataset.error = String(e); });
