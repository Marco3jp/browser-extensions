import type { EnvironmentSet, TemplateUrl } from "./types";
import { getEnvironmentSets, getTemplateUrls, setTemplateUrls } from "./storage";
import { buildUrlFromTemplate, findEnvForUrl, hasHostTemplateVar } from "./env-match";
import { pickHostSlotValue } from "./host-slot-picker";

const listEl = document.getElementById("list") as HTMLDivElement;
const searchEl = document.getElementById("search") as HTMLInputElement;
const editor = document.getElementById("editor") as HTMLDialogElement;
const fSet = document.getElementById("f-set") as HTMLSelectElement;
const fLabel = document.getElementById("f-label") as HTMLInputElement;
const fPath = document.getElementById("f-path") as HTMLInputElement;
const fTags = document.getElementById("f-tags") as HTMLInputElement;
const fMemo = document.getElementById("f-memo") as HTMLTextAreaElement;
const editorForm = document.getElementById("editor-form") as HTMLFormElement;

let sets: EnvironmentSet[] = [];
let items: TemplateUrl[] = [];
let editingId: string | null = null;

function newId(): string {
  return "tpl_" + crypto.randomUUID().slice(0, 8);
}

function setById(id: string): EnvironmentSet | undefined {
  return sets.find(s => s.id === id);
}

function pathFromUrl(u: URL): string {
  return u.pathname + u.search + u.hash;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

function openEditor(prefill?: Partial<TemplateUrl>): void {
  editingId = prefill?.id ?? null;
  fSet.innerHTML = "";
  for (const s of sets) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    fSet.append(opt);
  }
  fSet.value = prefill?.setId ?? sets[0]?.id ?? "";
  fLabel.value = prefill?.label ?? "";
  fPath.value = prefill?.path ?? "";
  fTags.value = (prefill?.tags ?? []).join(", ");
  fMemo.value = prefill?.memo ?? "";
  editor.showModal();
}

editorForm.addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!fSet.value) {
    alert("セットを先に作ってちょうだい");
    return;
  }
  const tags = fTags.value.split(",").map(s => s.trim()).filter(Boolean);
  if (editingId) {
    const target = items.find(i => i.id === editingId);
    if (target) {
      target.setId = fSet.value;
      target.label = fLabel.value;
      target.path = fPath.value;
      target.tags = tags;
      target.memo = fMemo.value;
      target.updatedAt = Date.now();
    }
  } else {
    items.unshift({
      id: newId(),
      setId: fSet.value,
      label: fLabel.value,
      path: fPath.value,
      memo: fMemo.value,
      tags,
      updatedAt: Date.now(),
    });
  }
  await setTemplateUrls(items);
  editor.close();
  render();
});

document.getElementById("f-cancel")!.addEventListener("click", () => editor.close());

document.getElementById("add-manual")!.addEventListener("click", () => openEditor());

document.getElementById("add-from-current")!.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    alert("現在のタブが取得できなかったわ");
    return;
  }
  let url: URL;
  try { url = new URL(tab.url); } catch { alert("URLを解釈できなかったわ"); return; }
  const match = findEnvForUrl(url, sets);
  openEditor({
    setId: match?.set.id ?? sets[0]?.id,
    label: tab.title ?? "",
    path: pathFromUrl(url),
    tags: [],
    memo: "",
  });
});

function matchesQuery(item: TemplateUrl, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (item.label.toLowerCase().includes(ql)) return true;
  if (item.memo.toLowerCase().includes(ql)) return true;
  if (item.tags.some(t => t.toLowerCase().includes(ql))) return true;
  return false;
}

function render(): void {
  listEl.innerHTML = "";
  const q = searchEl.value.trim();
  const filtered = items
    .filter(i => matchesQuery(i, q))
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (filtered.length === 0) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = items.length === 0 ? "まだテンプレが無いわ。右上のボタンから追加してね" : "一致するテンプレが無いわ";
    listEl.append(div);
    return;
  }

  for (const item of filtered) {
    const set = setById(item.setId);
    const div = document.createElement("div");
    div.className = "item";

    const head = document.createElement("div");
    head.className = "item-head";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item.label || "(無題)";
    const setBadge = document.createElement("span");
    setBadge.style.cssText = "color:#666;font-size:12px;";
    setBadge.textContent = set ? set.name : "(セット未設定)";
    const editBtn = document.createElement("button");
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => openEditor(item));
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.className = "danger";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`「${item.label}」を削除する？`)) return;
      items = items.filter(i => i.id !== item.id);
      await setTemplateUrls(items);
      render();
    });
    head.append(label, setBadge, editBtn, delBtn);

    const path = document.createElement("div");
    path.className = "path";
    path.textContent = item.path;

    const meta = document.createElement("div");
    meta.className = "meta";
    if (item.tags.length) {
      for (const t of item.tags) {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        meta.append(span);
      }
    }
    if (item.memo) {
      const memoEl = document.createElement("div");
      memoEl.textContent = item.memo;
      memoEl.style.cssText = "color:#555;margin-top:4px;white-space:pre-wrap;";
      meta.append(memoEl);
    }

    const envBtns = document.createElement("div");
    envBtns.className = "env-btns";
    if (set) {
      for (const env of set.environments) {
        const btn = document.createElement("button");
        btn.className = "env-btn";
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = env.color || "#888";
        const txt = document.createElement("span");
        txt.textContent = env.label || env.key;
        btn.append(swatch, txt);
        if (hasHostTemplateVar(env)) {
          const hint = document.createElement("span");
          hint.textContent = "*";
          hint.style.cssText = "color:#06c;font-weight:700;";
          btn.append(hint);
        }
        btn.addEventListener("click", async () => {
          let slotValue: string | undefined;
          if (set && hasHostTemplateVar(env)) {
            const picked = await pickHostSlotValue({ setId: set.id, env });
            if (!picked) return;
            slotValue = picked;
          }
          const url = buildUrlFromTemplate(env, item.path, slotValue);
          item.updatedAt = Date.now();
          await setTemplateUrls(items);
          chrome.tabs.create({ url });
        });
        envBtns.append(btn);
      }
    } else {
      const note = document.createElement("div");
      note.style.cssText = "color:#b00;font-size:12px;";
      note.textContent = "紐づくセットが見つからないわ。編集から選び直してちょうだい";
      envBtns.append(note);
    }

    div.append(head, path, meta, envBtns);
    listEl.append(div);
  }
}

searchEl.addEventListener("input", render);

async function init(): Promise<void> {
  sets = await getEnvironmentSets();
  items = await getTemplateUrls();
  render();
}

void init();
