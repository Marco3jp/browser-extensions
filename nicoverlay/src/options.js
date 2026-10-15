import { getSettings, saveSettings, isLocalServer, renderNgEditor, NICO_ORIGIN } from "./shared.js";

const $ = (id) => document.getElementById(id);

function setMsg(el, text, isErr = false) {
  el.textContent = text;
  el.className = isErr ? "err" : "msg";
}

async function init() {
  const s = await getSettings();
  $("serverUrl").value = s.serverUrl;
  $("usePastLog").checked = s.usePastLog;
  $("opacity").value = s.opacity;
  $("opacityVal").textContent = s.opacity;

  $("saveServer").addEventListener("click", async () => {
    const raw = $("serverUrl").value.trim();
    let url;
    try {
      url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      return setMsg($("serverMsg"), "URL が不正です", true);
    }
    // localhost / 127.0.0.1 以外は追加の権限が必要
    if (!isLocalServer(raw)) {
      const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
      if (!granted) return setMsg($("serverMsg"), "権限が許可されませんでした", true);
    }
    await saveSettings({ serverUrl: url.origin });
    $("serverUrl").value = url.origin;
    setMsg($("serverMsg"), "保存しました");
  });

  $("test").addEventListener("click", async () => {
    setMsg($("serverMsg"), "確認中…");
    const r = await chrome.runtime.sendMessage({ type: "health" });
    setMsg($("serverMsg"), r.ok ? "接続できました" : r.message, !r.ok);
  });

  $("usePastLog").addEventListener("change", async (e) => {
    const on = e.target.checked;
    if (on) {
      // クリック直後(ユーザー操作中)に権限を要求する
      const granted = await chrome.permissions.request({ origins: [NICO_ORIGIN] });
      if (!granted) {
        e.target.checked = false;
        return setMsg($("pastLogMsg"), "nicovideo.jp へのアクセスが許可されませんでした", true);
      }
      const { serverUrl } = await getSettings();
      if (!isLocalServer(serverUrl)) setMsg($("pastLogMsg"), "サーバーがローカルではないため、ログイン情報は送信されません", true);
      else setMsg($("pastLogMsg"), "");
    } else {
      await chrome.permissions.remove({ origins: [NICO_ORIGIN] });
      setMsg($("pastLogMsg"), "");
    }
    await saveSettings({ usePastLog: on });
  });

  $("opacity").addEventListener("input", async (e) => {
    $("opacityVal").textContent = e.target.value;
    await saveSettings({ opacity: Number(e.target.value) });
  });

  await renderNgEditor($("ng"));
}

init();
