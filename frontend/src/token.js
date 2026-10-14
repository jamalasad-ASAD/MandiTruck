// Tiny token store (localStorage). Kept separate to avoid circular imports.
const KEY = "mt_token";

export function getToken() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch (_) {
    return "";
  }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch (_) {}
}
