// Token storage.
//   - Accounts  -> localStorage  (persists across browser restarts).
//   - Guests    -> sessionStorage (gone when the tab/session ends, so a fresh
//                  guest + new friend code is issued next time — per the spec).
const KEY = "pc_token";
const KIND = "pc_kind"; // "guest" | "account"

export function saveAuth(token, kind) {
  clearAuth();
  const store = kind === "account" ? localStorage : sessionStorage;
  store.setItem(KEY, token);
  store.setItem(KIND, kind);
}

export function getToken() {
  return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || null;
}

export function getKind() {
  return localStorage.getItem(KIND) || sessionStorage.getItem(KIND) || null;
}

export function clearAuth() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(KIND);
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(KIND);
}
