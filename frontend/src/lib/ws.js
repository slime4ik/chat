import { getToken } from "./auth.js";

// Resilient WebSocket wrapper: auto-reconnect with backoff, heartbeat ping,
// and a simple subscribe(handler) fan-out.
export class ChatSocket {
  constructor() {
    this.ws = null;
    this.handlers = new Set();
    this.shouldRun = false;
    this.backoff = 1000;
    this.pingTimer = null;
  }

  connect() {
    this.shouldRun = true;
    this._open();
  }

  _open() {
    const token = getToken();
    if (!token) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws/chat/?token=${encodeURIComponent(token)}`);

    this.ws.onopen = () => {
      this.backoff = 1000;
      this._emit({ type: "_status", online: true });
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25000);
    };
    this.ws.onmessage = (e) => {
      try {
        this._emit(JSON.parse(e.data));
      } catch (_) {}
    };
    this.ws.onclose = () => {
      clearInterval(this.pingTimer);
      this._emit({ type: "_status", online: false });
      if (this.shouldRun) {
        setTimeout(() => this._open(), this.backoff);
        this.backoff = Math.min(this.backoff * 1.6, 15000);
      }
    };
    this.ws.onerror = () => this.ws && this.ws.close();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  subscribe(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  _emit(msg) {
    this.handlers.forEach((h) => h(msg));
  }

  close() {
    this.shouldRun = false;
    clearInterval(this.pingTimer);
    if (this.ws) this.ws.close();
  }
}
