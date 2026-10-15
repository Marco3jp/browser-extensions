// content script からの要求をローカルバックエンドに中継する。
// user_session はここでだけ読み、ローカルのサーバーにだけ送る。
import { getSettings, isLocalServer, NICO_ORIGIN } from "./shared.js";

async function api(path, { session } = {}) {
  const { serverUrl } = await getSettings();
  const headers = {};
  if (session) headers["X-Nico-Session"] = session;
  let res;
  try {
    res = await fetch(serverUrl.replace(/\/+$/, "") + path, { headers });
  } catch (e) {
    return { ok: false, error: "network", message: `バックエンドに接続できません (${serverUrl}): ${e.message}` };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, error: data?.error ?? "http", message: data?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

async function readSession() {
  const { serverUrl } = await getSettings();
  if (!isLocalServer(serverUrl)) return null;
  if (!(await chrome.permissions.contains({ origins: [NICO_ORIGIN] }))) return null;
  const c = await chrome.cookies.get({ url: "https://www.nicovideo.jp/", name: "user_session" });
  return c?.value ?? null;
}

async function handle(msg) {
  switch (msg.type) {
    case "health":
      return api("/healthz");
    case "search":
      return api(`/api/search?limit=30&q=${encodeURIComponent(msg.q)}`);
    case "comments": {
      const q = new URLSearchParams({ mode: msg.mode });
      if (msg.refresh) q.set("refresh", "1");
      const session = msg.mode === "all" ? await readSession() : null;
      if (msg.mode === "all" && !session) {
        return { ok: false, status: 401, error: "session_unavailable", message: "ニコニコのログイン情報を取得できません（設定で過去ログを有効にし、ニコニコにログインしてください）" };
      }
      return api(`/api/videos/${encodeURIComponent(msg.id)}/comments?${q}`, { session });
    }
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    default:
      return { ok: false, error: "unknown_message" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: "exception", message: String(e) }));
  return true;
});
