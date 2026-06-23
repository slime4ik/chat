// Lightweight notifications: browser push (when tab is hidden / chat not open),
// a short sound, and an unread badge in the tab title.

const BASE_TITLE = "Blank";

export function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

export function showNotification(title, body, onClick) {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, {
      body,
      tag: "blank-msg",
      icon: "/favicon.svg",
      silent: true, // we play our own sound
    });
    n.onclick = () => {
      window.focus();
      onClick && onClick();
      n.close();
    };
  } catch {}
}

// Short, soft "ping" via WebAudio — no asset file needed.
let audioCtx = null;
export function playPing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.26);
  } catch {}
}

export function setUnreadTitle(count) {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}
