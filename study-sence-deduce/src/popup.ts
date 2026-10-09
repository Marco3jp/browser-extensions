import { getEnvironmentSets } from "./storage";
import { findEnvForUrl, hasHostTemplateVar, switchUrl } from "./env-match";
import { pickHostSlotValue } from "./host-slot-picker";

const currentEl = document.getElementById("current") as HTMLDivElement;
const listEl = document.getElementById("switch-list") as HTMLDivElement;

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function init(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    currentEl.textContent = "現在のタブが取得できなかったわ";
    return;
  }
  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    currentEl.textContent = "URLとして解釈できないタブね";
    return;
  }

  const sets = await getEnvironmentSets();
  const match = findEnvForUrl(url, sets);

  if (!match) {
    currentEl.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = "登録されたどの環境にも一致しなかったわ";
    currentEl.append(span);
    return;
  }

  currentEl.innerHTML = "";
  const tag = document.createElement("span");
  tag.className = "env-tag";
  tag.style.background = match.env.color || "#888";
  tag.textContent = match.env.label || match.env.key;
  const setName = document.createElement("span");
  setName.textContent = match.set.name;
  setName.style.color = "#666";
  currentEl.append(tag, setName);

  const others = match.set.environments.filter(e => e.key !== match.env.key);
  if (others.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "他に切り替え先の環境が無いわね";
    listEl.append(empty);
    return;
  }

  for (const env of others) {
    const btn = document.createElement("button");
    btn.className = "env-btn";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = env.color || "#888";
    const label = document.createElement("span");
    label.textContent = env.label || env.key;
    const host = document.createElement("span");
    host.textContent = env.hostTemplate;
    host.style.cssText = "color:#888;margin-left:auto;font-size:11px;";
    btn.append(swatch, label, host);
    if (hasHostTemplateVar(env)) {
      const hint = document.createElement("span");
      hint.textContent = "*";
      hint.style.cssText = "margin-left:4px;color:#06c;font-weight:700;";
      btn.append(hint);
    }
    btn.addEventListener("click", async () => {
      let slotValue: string | undefined;
      if (hasHostTemplateVar(env)) {
        const picked = await pickHostSlotValue({ setId: match.set.id, env });
        if (!picked) return;
        slotValue = picked;
      }
      const next = switchUrl(url, env, slotValue);
      await chrome.tabs.update(tab.id!, { url: next });
      window.close();
    });
    listEl.append(btn);
  }
}

document.getElementById("open-templates")!.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("templates.html") });
});
document.getElementById("open-options")!.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

void init();
