// 設定・NG 判定・NG 編集 UI を background / content / options で共有する。

export const DEFAULT_SETTINGS = {
  serverUrl: "http://localhost:8787",
  usePastLog: false,
  opacity: 1,
  ng: { words: [], users: [], hideEasy: false },
};

export const NICO_ORIGIN = "https://*.nicovideo.jp/*";

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    ng: { ...DEFAULT_SETTINGS.ng, ...settings?.ng },
  };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  await chrome.storage.local.set({ settings: { ...cur, ...patch } });
}

// user_session を送ってよいのはローカルのバックエンドだけ。
export function isLocalServer(url) {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

const normalize = (s) => s.normalize("NFKC").toLowerCase();

// NG ワードは 1 行 1 件。/pattern/flags 形式は正規表現、それ以外は部分一致(全角半角・大小文字を無視)。
export function compileNg(ng) {
  const subs = [];
  const res = [];
  for (const line of ng.words) {
    const w = line.trim();
    if (!w) continue;
    const m = w.match(/^\/(.+)\/([a-z]*)$/);
    if (m) {
      try {
        res.push(new RegExp(m[1], m[2].replace("g", ""))); // g は test() が状態を持つので外す
        continue;
      } catch {
        // 不正な正規表現は文字列として扱う
      }
    }
    subs.push(normalize(w));
  }
  const users = new Set(ng.users.map((u) => u.trim()).filter(Boolean));

  return (comment) => {
    if (users.has(comment.userId)) return true;
    if (subs.length) {
      const body = normalize(comment.body);
      if (subs.some((s) => body.includes(s))) return true;
    }
    return res.some((r) => r.test(comment.body));
  };
}

// NG 適用後のスレッドと除外件数を返す。
export function applyNg(threads, ng) {
  const isNg = compileNg(ng);
  let removed = 0;
  const out = [];
  for (const t of threads) {
    if (ng.hideEasy && t.fork === "easy") {
      removed += t.comments.length;
      continue;
    }
    const comments = t.comments.filter((c) => !isNg(c));
    removed += t.comments.length - comments.length;
    out.push({ ...t, comments });
  }
  return { threads: out, removed };
}

const splitLines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

// NG 編集フォームを container に描画する。保存すると chrome.storage 経由で各タブに反映される。
export async function renderNgEditor(container) {
  const { ng } = await getSettings();
  container.innerHTML = `
    <label class="ng-label">NGワード（1行1件、<code>/正規表現/i</code> も可）
      <textarea class="ng-words" rows="5" spellcheck="false"></textarea></label>
    <label class="ng-label">NGユーザーID（1行1件）
      <textarea class="ng-users" rows="3" spellcheck="false"></textarea></label>
    <label class="ng-check"><input type="checkbox" class="ng-easy"> かんたんコメントを表示しない</label>
    <div class="ng-actions"><button type="button" class="ng-save">NG設定を保存</button>
      <span class="ng-msg"></span></div>`;
  const $ = (sel) => container.querySelector(sel);
  $(".ng-words").value = ng.words.join("\n");
  $(".ng-users").value = ng.users.join("\n");
  $(".ng-easy").checked = ng.hideEasy;
  $(".ng-save").addEventListener("click", async () => {
    await saveSettings({
      ng: {
        words: splitLines($(".ng-words").value),
        users: splitLines($(".ng-users").value),
        hideEasy: $(".ng-easy").checked,
      },
    });
    $(".ng-msg").textContent = "保存しました";
    setTimeout(() => ($(".ng-msg").textContent = ""), 2000);
  });
}
