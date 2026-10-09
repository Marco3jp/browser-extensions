import type { PageIndexStatus } from "./content";

const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;
const statusBadge = document.getElementById("status") as HTMLSpanElement;
const pageStatusEl = document.getElementById("page-status") as HTMLDivElement;

let isActive = false;

async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadPageIndexStatus(): Promise<void> {
  const tab = await getCurrentTab();
  if (!tab?.id) return;

  pageStatusEl.dataset.state = "loading";

  try {
    const result: PageIndexStatus = await chrome.tabs.sendMessage(tab.id, {
      type: "HCA_GET_PAGE_STATUS",
    });
    renderPageIndexStatus(result);
  } catch {
    pageStatusEl.dataset.state = "error";
    pageStatusEl.querySelector(".page-status-body")!.textContent =
      "取得失敗 (ページを再読み込みしてください)";
  }
}

function renderPageIndexStatus(status: PageIndexStatus): void {
  pageStatusEl.dataset.state = status.indexable ? "indexable" : "noindex";

  const icon = pageStatusEl.querySelector(".page-status-icon")!;
  const label = pageStatusEl.querySelector(".page-status-label")!;
  const reasons = pageStatusEl.querySelector(".page-status-reasons")!;

  icon.textContent = status.indexable ? "✅" : "🚫";
  label.textContent = status.indexable ? "インデックス可能" : "インデックス対象外";

  reasons.innerHTML = "";
  for (const reason of status.reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    reasons.appendChild(li);
  }
}

toggleBtn.addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab?.id) return;

  isActive = !isActive;

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: isActive ? "HCA_ON" : "HCA_OFF",
    });
  } catch {
    isActive = !isActive;
    statusBadge.textContent = "エラー: ページを再読み込みしてください";
    return;
  }

  updateUI();
});

function updateUI(): void {
  toggleBtn.textContent = isActive ? "ハイライト解除" : "ハイライト表示";
  toggleBtn.dataset.active = String(isActive);
  statusBadge.textContent = isActive ? "ON" : "OFF";
  statusBadge.dataset.active = String(isActive);
}

updateUI();
loadPageIndexStatus();
