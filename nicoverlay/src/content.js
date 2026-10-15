// dアニメストアの再生ページにコメントを重ねる。
// partId ごとに「どのニコニコ動画のコメントを使うか」とオフセットを chrome.storage.local に保存する。
import NiconiComments from "@xpadev-net/niconicomments";
import { getSettings, saveSettings, applyNg, renderNgEditor } from "./shared.js";

const send = (msg) => chrome.runtime.sendMessage(msg);

const state = {
  video: null,
  partId: null,
  map: null, // { contentId, title, duration, offset }
  raw: null, // バックエンドから取得したスレッド(NG 適用前)
  meta: null, // { mode, fetchedAt, video }
  nc: null,
  removed: 0,
  visible: true,
  settings: null,
  lastVpos: -1,
  lastRect: "",
  note: "",
};

// ---- UI ----

const host = document.createElement("div");
host.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;left:0;top:0;width:0;height:0;";
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  canvas { position: absolute; pointer-events: none; }
  .toggle, .panel { pointer-events: auto; font: 13px/1.5 system-ui, sans-serif; color: #eee; }
  .toggle { position: absolute; top: 8px; right: 8px; padding: 2px 8px; border: 1px solid #888; border-radius: 4px;
    background: rgba(0,0,0,.6); color: #eee; cursor: pointer; opacity: .35; }
  .toggle:hover { opacity: 1; }
  .toggle.off { text-decoration: line-through; }
  .panel { position: absolute; top: 36px; right: 8px; width: 400px; max-height: calc(100% - 48px); overflow: auto;
    background: rgba(20,20,20,.92); border: 1px solid #555; border-radius: 6px; padding: 8px 10px; }
  .panel[hidden] { display: none; }
  .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 6px 0; }
  button { font: inherit; color: #eee; background: #333; border: 1px solid #666; border-radius: 3px; padding: 1px 6px; cursor: pointer; }
  button:hover { background: #444; }
  input[type=text], textarea { font: inherit; color: #eee; background: #111; border: 1px solid #666; border-radius: 3px; width: 100%; }
  textarea { font-family: ui-monospace, monospace; }
  .search { display: flex; gap: 4px; } .search input { flex: 1; }
  .status { white-space: pre-wrap; color: #ccc; }
  .offval { min-width: 4.5em; text-align: center; font-variant-numeric: tabular-nums; }
  .results { list-style: none; margin: 6px 0; padding: 0; }
  .results li { padding: 4px 6px; border-bottom: 1px solid #333; cursor: pointer; }
  .results li:hover { background: #2a2a2a; }
  .results li.selected { background: #234; }
  .results .sub { color: #999; font-size: 12px; }
  details { margin-top: 6px; } summary { cursor: pointer; }
  .ng-label { display: block; margin: 6px 0; } .ng-check { display: block; margin: 6px 0; }
  .ng-msg { margin-left: 6px; color: #9c9; }
  code { color: #fc9; }
</style>
<canvas width="1920" height="1080"></canvas>
<button class="toggle" title="nicoverlay">ニコ</button>
<div class="panel" hidden>
  <div class="status"></div>
  <div class="row">
    <button data-act="visible"></button>
    <button data-act="refetch">再取得</button>
    <button data-act="options">設定</button>
    <button data-act="close">閉じる</button>
  </div>
  <div class="row">
    オフセット
    <button data-off="-5">−5</button><button data-off="-0.5">−0.5</button>
    <span class="offval"></span>
    <button data-off="0.5">+0.5</button><button data-off="5">+5</button>
    <button data-act="offreset">0</button>
    <button data-act="offdur" hidden></button>
  </div>
  <form class="search"><input type="text" name="q" placeholder="タイトルで検索"><button>検索</button></form>
  <ul class="results"></ul>
  <details><summary>NG設定</summary><div class="ng"></div></details>
</div>`;

const $ = (sel) => root.querySelector(sel);
const canvas = $("canvas");
const panel = $(".panel");

// プレイヤーのショートカットやクリック(再生/一時停止)に奪われないようにする
for (const ev of ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "wheel"]) {
  root.addEventListener(ev, (e) => e.stopPropagation());
}

$(".toggle").addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  if (!panel.hidden && !$(".search input").value) $(".search input").value = suggestQuery();
});

panel.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.off) return setOffset(round1((state.map?.offset ?? 0) + Number(btn.dataset.off)));
  switch (btn.dataset.act) {
    case "visible":
      state.visible = !state.visible;
      canvas.style.display = state.visible ? "" : "none";
      state.lastVpos = -1;
      renderControls();
      break;
    case "refetch":
      if (state.map) loadComments(true);
      break;
    case "options":
      send({ type: "openOptions" });
      break;
    case "close":
      panel.hidden = true;
      break;
    case "offreset":
      setOffset(0);
      break;
    case "offdur":
      setOffset(-durationDiff());
      break;
  }
});

$(".search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $(".search input").value.trim();
  if (!q) return;
  const list = $(".results");
  list.textContent = "検索中…";
  const r = await send({ type: "search", q });
  list.textContent = "";
  if (!r.ok) return (list.textContent = `検索失敗: ${r.message}`);
  if (!r.data.videos.length) return (list.textContent = "見つかりませんでした");
  for (const v of r.data.videos) {
    const li = document.createElement("li");
    if (v.contentId === state.map?.contentId) li.className = "selected";
    const title = document.createElement("div");
    title.textContent = v.title;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${v.contentId}  コメ ${v.commentCounter.toLocaleString()} / 再生 ${v.viewCounter.toLocaleString()} / ${fmtTime(v.lengthSeconds)} / ${v.startTime.slice(0, 10)}${v.channelId ? ` / ch${v.channelId}` : ""}`;
    li.append(title, sub);
    li.addEventListener("click", () => {
      for (const el of list.children) el.classList.remove("selected");
      li.classList.add("selected");
      selectVideo(v);
    });
    list.append(li);
  }
});

function renderControls() {
  $('[data-act="visible"]').textContent = state.visible ? "コメント: 表示" : "コメント: 非表示";
  $(".toggle").classList.toggle("off", !state.visible);
  $(".offval").textContent = `${(state.map?.offset ?? 0) >= 0 ? "+" : ""}${(state.map?.offset ?? 0).toFixed(1)}s`;

  const diff = durationDiff();
  const durBtn = $('[data-act="offdur"]');
  // 2 分以上ずれているなら別の動画の可能性が高いので補正は出さない
  durBtn.hidden = diff === null || Math.abs(diff) < 0.5 || Math.abs(diff) > 120;
  if (!durBtn.hidden) {
    durBtn.textContent = `尺差 ${diff > 0 ? "+" : ""}${diff.toFixed(1)}s を補正`;
    durBtn.title = `dアニメ ${fmtTime(state.video.duration)} / ニコニコ ${fmtTime(state.map.duration)}`;
  }

  let s;
  if (!state.map) s = "未設定: 検索してコメントを使う動画を選んでください";
  else if (!state.raw) s = `${state.map.contentId} ${state.map.title}\n${state.note || "取得中…"}`;
  else {
    const total = state.raw.reduce((n, t) => n + t.comments.length, 0);
    s = `${state.map.contentId} ${state.map.title}\n${total.toLocaleString()}件（NG ${state.removed.toLocaleString()}）・${state.meta.mode === "all" ? "過去ログ込み" : "最新分"}`;
    if (state.note) s += `\n${state.note}`;
  }
  $(".status").textContent = s;
}

// ---- 状態遷移 ----

async function selectVideo(v) {
  state.map = { contentId: v.contentId, title: v.title, duration: v.lengthSeconds, offset: 0 };
  await saveMap();
  loadComments(false);
}

async function loadComments(refresh) {
  const partId = state.partId;
  const { contentId } = state.map;
  const mode = state.settings.usePastLog ? "all" : "latest";
  state.raw = null;
  state.note = mode === "all" ? "過去ログ取得中…（数十秒かかることがあります）" : "取得中…";
  rebuild();

  let r = await send({ type: "comments", id: contentId, mode, refresh });
  let note = "";
  if (!r.ok && mode === "all" && r.status === 401) {
    note = `過去ログを取得できませんでした（${r.message}）。最新分のみ表示します`;
    r = await send({ type: "comments", id: contentId, mode: "latest", refresh });
  }
  // 取得中に話数や選択が変わっていたら捨てる
  if (state.partId !== partId || state.map?.contentId !== contentId) return;
  if (!r.ok) {
    state.note = `取得失敗: ${r.message}`;
    return renderControls();
  }
  state.raw = r.data.threads;
  state.meta = r.data;
  state.note = note;
  rebuild();
}

function rebuild() {
  state.nc?.destroy();
  state.nc = null;
  state.lastVpos = -1;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  if (state.raw) {
    const { threads, removed } = applyNg(state.raw, state.settings.ng);
    state.removed = removed;
    state.nc = new NiconiComments(canvas, threads, { format: "v1" });
  }
  renderControls();
}

async function setOffset(sec) {
  if (!state.map) return;
  state.map.offset = sec;
  state.lastVpos = -1;
  renderControls();
  await saveMap();
}

const mapKey = () => `part:${state.partId}`;
const saveMap = () => chrome.storage.local.set({ [mapKey()]: state.map });

async function onPartChange() {
  state.raw = null;
  state.meta = null;
  state.note = "";
  state.map = (await chrome.storage.local.get(mapKey()))[mapKey()] ?? null;
  $(".results").textContent = "";
  $(".search input").value = "";
  rebuild();
  if (state.map) loadComments(false);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const prev = state.settings;
  getSettings().then((s) => {
    state.settings = s;
    canvas.style.opacity = s.opacity;
    if (JSON.stringify(prev.ng) !== JSON.stringify(s.ng)) rebuild();
    else if (prev.usePastLog !== s.usePastLog && state.map) loadComments(false);
  });
});

// ---- 再生画面への追従 ----

function findVideo() {
  let best = null;
  let bestArea = 0;
  for (const v of document.querySelectorAll("video")) {
    const r = v.getBoundingClientRect();
    if (r.width * r.height > bestArea) {
      best = v;
      bestArea = r.width * r.height;
    }
  }
  return best;
}

function placeHost() {
  const fs = document.fullscreenElement;
  // video 要素自体が全画面のときは重ねられないので body に置く(表示されない)
  const parent = fs && fs !== state.video && fs.contains(state.video) ? fs : document.body;
  if (host.parentNode !== parent) parent.append(host);
  state.lastRect = "";
}
document.addEventListener("fullscreenchange", placeHost);

function layout() {
  const r = state.video.getBoundingClientRect();
  const key = `${r.left},${r.top},${r.width},${r.height}`;
  if (key === state.lastRect) return;
  state.lastRect = key;
  Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  // niconicomments のステージは 16:9。動画領域に収まるよう中央寄せする
  let w = r.width;
  let h = (w * 9) / 16;
  if (h > r.height) {
    h = r.height;
    w = (h * 16) / 9;
  }
  Object.assign(canvas.style, { left: `${(r.width - w) / 2}px`, top: `${(r.height - h) / 2}px`, width: `${w}px`, height: `${h}px` });
}

function frame() {
  requestAnimationFrame(frame);
  if (!state.video || !state.video.isConnected) return;
  layout();
  if (!state.nc || !state.visible) return;
  const vpos = Math.max(0, Math.floor((state.video.currentTime + (state.map?.offset ?? 0)) * 100));
  if (vpos === state.lastVpos) return;
  state.lastVpos = vpos;
  state.nc.drawCanvas(vpos);
}

// dアニメは同じページ内で次の話に切り替わることがあるので、video と partId を定期的に確認する
function poll() {
  const v = findVideo();
  if (v && v !== state.video) {
    state.video = v;
    v.addEventListener("loadedmetadata", renderControls);
    placeHost();
  }
  const partId = new URL(location.href).searchParams.get("partId");
  if (partId && partId !== state.partId) {
    state.partId = partId;
    onPartChange();
  }
}

// ---- ユーティリティ ----

function durationDiff() {
  const d = state.video?.duration;
  if (!state.map?.duration || !Number.isFinite(d)) return null;
  return round1(d - state.map.duration);
}

// dアニメのページから「作品名 話数」を推定する。取れなければページタイトルを使う
function suggestQuery() {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? "";
  const work = text(".backInfoTxt1");
  const ep = text(".backInfoTxt2");
  if (work) {
    const num = ep.normalize("NFKC").match(/\d+/)?.[0];
    return `${work} ${num ?? ep}`.trim();
  }
  return document.title.split(/\s*[|｜]\s*/).filter((s) => s && !s.includes("dアニメストア")).join(" ");
}

const round1 = (n) => Math.round(n * 10) / 10;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---- 起動 ----

(async () => {
  state.settings = await getSettings();
  canvas.style.opacity = state.settings.opacity;
  await renderNgEditor($(".ng"));
  renderControls();
  poll();
  setInterval(poll, 1000);
  requestAnimationFrame(frame);
})();
