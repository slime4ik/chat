import { getToken, clearAuth } from "./auth.js";

// Same-origin relative base (vite proxy in dev, nginx in prod).
const BASE = "/api";

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Token ${token}`;

  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    // Network / DNS / server down — fetch rejected before any response.
    throw new Error("Нет соединения с сервером. Проверьте интернет.");
  }

  // Don't treat a failed login (401 on the auth endpoints) as a session expiry.
  const isAuthCall = path.startsWith("/auth/login") || path.startsWith("/auth/register");
  if (res.status === 401 && !isAuthCall) {
    clearAuth();
    window.dispatchEvent(new Event("pc:logout"));
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // non-JSON body (e.g. an HTML error page) — handled below
  }

  if (!res.ok) {
    throw new Error(humanError(data, res.status));
  }
  return data;
}

// Turn any backend error shape into a single human-readable string for the UI.
function humanError(data, status) {
  if (data) {
    if (typeof data === "string") return data;
    if (typeof data.detail === "string") return data.detail;
    // DRF field errors: { field: ["msg", ...], non_field_errors: [...] }
    const parts = [];
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) parts.push(...v.filter((x) => typeof x === "string"));
      else if (typeof v === "string") parts.push(v);
    }
    if (parts.length) return parts.join(" ");
  }
  if (status === 429) return "Слишком много попыток. Подождите минуту.";
  if (status >= 500) return "Ошибка на сервере. Попробуйте позже.";
  if (status === 400) return "Неверные данные в запросе.";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

export const api = {
  // auth
  guest: () => request("/auth/guest/", { method: "POST" }),
  register: (username, password, nickname) =>
    request("/auth/register/", { method: "POST", body: { username, password, nickname } }),
  login: (username, password) =>
    request("/auth/login/", { method: "POST", body: { username, password } }),
  me: () => request("/auth/me/"),
  stats: () => request("/auth/stats/"),
  rotateCode: () => request("/auth/rotate-code/", { method: "POST" }),

  // chat
  conversations: () => request("/conversations/"),
  requests: () => request("/requests/"),
  addContact: (code) => request("/contacts/add/", { method: "POST", body: { code } }),
  acceptRequest: (convId) =>
    request(`/conversations/${convId}/accept/`, { method: "POST" }),
  declineRequest: (convId) =>
    request(`/conversations/${convId}/decline/`, { method: "POST" }),
  messages: (convId, { before, after } = {}) => {
    const q = before
      ? `?before=${encodeURIComponent(before)}`
      : after
      ? `?after=${encodeURIComponent(after)}`
      : "";
    return request(`/conversations/${convId}/messages/${q}`);
  },
  sendMessage: (convId, payload) =>
    request(`/conversations/${convId}/messages/`, { method: "POST", body: payload }),
  deleteMessage: (convId, msgId) =>
    request(`/conversations/${convId}/messages/${msgId}/`, { method: "DELETE" }),
  editMessage: (convId, msgId, text) =>
    request(`/conversations/${convId}/messages/${msgId}/`, { method: "PATCH", body: { text } }),
  markRead: (convId) =>
    request(`/conversations/${convId}/read/`, { method: "POST" }),
};

export { request };
