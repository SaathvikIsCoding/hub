// Focus timer (pomodoro). Keeps running across screens; the end time is stored
// so a reload or a closed window doesn't lose it.
import { h, clear } from '../ui.js';
import { load, save } from '../store.js';

const PRESETS = [25, 50, 5];
let tick;

export function focusTimer() {
  const root = h('div', { class: 'focus' });
  const draw = () => {
    const t = load('focus');
    const left = t ? Math.max(0, t.end - Date.now()) : 0;
    if (t && left === 0) {
      save('focus', null);
      notify(`${t.mins}-minute ${t.mins <= 10 ? 'break' : 'focus'} done`);
    }
    const running = t && left > 0;
    const mm = String(Math.floor(left / 60000)).padStart(2, '0');
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
    clear(root,
      h('p', { class: 'focus-clock', 'aria-live': 'off' }, running ? `${mm}:${ss}` : '--:--'),
      h('div', { class: 'focus-actions' },
        running
          ? h('button', { class: 'btn', type: 'button', onclick: () => { save('focus', null); draw(); } }, 'Stop')
          : PRESETS.map((m) => h('button', { class: `btn ${m === 25 ? 'btn-primary' : ''}`, type: 'button', onclick: () => { save('focus', { end: Date.now() + m * 60000, mins: m }); draw(); } }, m <= 10 ? `${m} min break` : `${m} min`))));
  };
  draw();
  clearInterval(tick);
  tick = setInterval(() => { if (root.isConnected) draw(); else clearInterval(tick); }, 1000);
  return root;
}

export function notify(text) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification('Hub', { body: text, icon: 'icons/icon-192.png', tag: text }))
        .catch(() => new Notification('Hub', { body: text }));
    }
  } catch { /* notifications unsupported */ }
}
