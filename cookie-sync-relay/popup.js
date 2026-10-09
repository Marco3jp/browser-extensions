// --- Status definitions ---

const STATUS_INFO = {
  gray:   { label: "対象外のページです",      message: null, messageType: null },
  green:  { label: "正常に同期されています",  message: null, messageType: null },
  green_deduped: {
    label: "同期済み（重複Cookie検出）",
    message: "有効なCookieが同期されていますが、同一キーのCookieが複数のドメインスコープに存在します。ログインなど失敗してうまくいかない場合は、下の一覧から該当Cookieを削除してください。",
    messageType: "warn",
  },
  yellow: {
    label: "一部のCookieが期限切れです",
    message: "有効なCookieと期限切れのCookieが混在しています。\nSourceページを開いてCookieを再取得してください。",
    messageType: "warn",
  },
  orange: {
    label: "CookieがすべてExpiredです",
    message: "同期済みのCookieがすべて期限切れです。\nSourceページを開いてCookieを再取得してください。",
    messageType: "warn",
  },
  red: {
    label: "未同期",
    message: "同期済みCookieが見つかりません。\nSourceページを開いてCookieを取得してください。",
    messageType: "error",
  },
  blue: {
    label: "Sourceページを監視中",
    message: "このページのCookieを同期先へ転送します。",
    messageType: "info",
  },
  blue_deduped: {
    label: "Sourceページを監視中（重複Cookie検出）",
    message: "Cookieの読み取りは成功していますが、同一キーのCookieが複数のドメインスコープに存在します。このページ自体のログイン状態に影響している可能性があります。問題が起きた場合は下の一覧から削除してください。",
    messageType: "warn",
  },
  purple: {
    label: "同期対象のCookieが確認できません",
    message: "同期したいCookieが見つかりません。\nログインに失敗しているなど考えられますので確認してください。",
    messageType: "error",
  },
};

// --- Tab switching ---

document.querySelectorAll(".tab-bar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-bar button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// --- Status tab ---

function renderStatus(statusKey, duplicates = []) {
  const info = STATUS_INFO[statusKey] || STATUS_INFO.gray;
  document.getElementById("status-dot").className = `status-dot dot-${statusKey}`;
  document.getElementById("status-label").textContent = info.label;

  const msgEl = document.getElementById("status-message");
  if (info.message) {
    msgEl.textContent = info.message;
    msgEl.className = `status-message ${info.messageType || ""}`;
    msgEl.style.display = "block";
  } else {
    msgEl.style.display = "none";
  }

  renderDuplicates(duplicates);
}

function renderDuplicates(duplicates) {
  const container = document.getElementById("duplicates-container");
  container.innerHTML = "";
  if (!duplicates || duplicates.length === 0) return;

  const list = document.createElement("ul");
  list.className = "dup-list";

  duplicates.forEach((dup) => {
    const li = document.createElement("li");
    li.className = "dup-row";

    const info = document.createElement("div");
    info.className = "dup-info";
    info.innerHTML = `<span class="dup-name">${escHtml(dup.name)}</span><span class="dup-domain">${escHtml(dup.domain)}</span>`;

    const btn = document.createElement("button");
    btn.className = "dup-delete-btn";
    btn.textContent = "削除";
    btn.addEventListener("click", () => {
      chrome.cookies.remove({ url: dup.removeUrl, name: dup.name }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (!tab?.url) return;
          chrome.runtime.sendMessage({ type: "getTabStatus", url: tab.url }, (result) => {
            renderStatus(result?.status || "gray", result?.duplicates || []);
          });
        });
      });
    });

    li.appendChild(info);
    li.appendChild(btn);
    list.appendChild(li);
  });

  container.appendChild(list);
}

function loadStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url) { renderStatus("gray"); return; }
    chrome.runtime.sendMessage({ type: "getTabStatus", url: tab.url }, (result) => {
      renderStatus(result?.status || "gray", result?.duplicates || []);
    });
  });
}

loadStatus();

// --- Settings tab ---

let editingRuleIndex = -1;

function switchToTab(tabName) {
  document.querySelectorAll(".tab-bar button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

function enterEditMode(rule, ruleIdx) {
  editingRuleIndex = ruleIdx;
  switchToTab("settings");

  document.getElementById("sourceDomain").value = rule.sourceDomain;
  document.getElementById("keys").value = rule.keys.join(", ");

  const container = document.getElementById("new-target-rows");
  container.innerHTML = "";
  (rule.targets || []).forEach((target) => {
    addNewTargetRow(container);
    const row = container.lastElementChild;
    if (target.domain.startsWith(".")) {
      row.querySelector(".t-domain").value = target.domain;
      row.querySelector(".t-url").disabled = true;
    } else {
      const parsedUrl = (() => { try { return new URL(target.url); } catch { return null; } })();
      const isUrlDerived = parsedUrl && parsedUrl.hostname === target.domain && parsedUrl.protocol === "http:" && parsedUrl.pathname === "/";
      if (isUrlDerived) {
        row.querySelector(".t-domain").value = target.domain;
        row.querySelector(".t-url").disabled = true;
      } else {
        row.querySelector(".t-url").value = target.url;
        row.querySelector(".t-domain").disabled = true;
      }
    }
  });

  document.getElementById("save-btn").textContent = "変更を保存";
  document.getElementById("edit-mode-bar").style.display = "flex";
  document.getElementById("edit-mode-label").textContent = `「${rule.sourceDomain}」を編集中`;
}

function resetForm(container) {
  editingRuleIndex = -1;
  document.getElementById("sourceDomain").value = "";
  document.getElementById("keys").value = "";
  container.innerHTML = "";
  addNewTargetRow(container);
  document.getElementById("save-btn").textContent = "ルールを追加";
  document.getElementById("edit-mode-bar").style.display = "none";
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// URL または Domain の片方だけ入力を受け付ける行を追加する
function addNewTargetRow(container) {
  const row = document.createElement("div");
  row.className = "target-row";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "t-url";
  urlInput.placeholder = "URL (例: http://localhost:3000)";

  const sep = document.createElement("span");
  sep.className = "t-or";
  sep.textContent = "または";

  const domainInput = document.createElement("input");
  domainInput.type = "text";
  domainInput.className = "t-domain";
  domainInput.placeholder = "Domain (例: localhost)";

  urlInput.addEventListener("input", () => {
    const filled = urlInput.value.trim().length > 0;
    domainInput.disabled = filled;
    if (filled) domainInput.value = "";
  });

  domainInput.addEventListener("input", () => {
    const filled = domainInput.value.trim().length > 0;
    urlInput.disabled = filled;
    if (filled) urlInput.value = "";
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "削除";
  removeBtn.addEventListener("click", () => {
    row.remove();
    syncRemoveBtnState(container);
  });

  row.appendChild(urlInput);
  row.appendChild(sep);
  row.appendChild(domainInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
  syncRemoveBtnState(container);
}

// URL または Domain のどちらかから { url, domain } を導出する
function resolveTarget(row) {
  const urlVal = row.querySelector(".t-url").value.trim();
  const domainVal = row.querySelector(".t-domain").value.trim();
  if (urlVal) {
    try {
      return { url: urlVal, domain: new URL(urlVal).hostname };
    } catch { return null; }
  }
  if (domainVal) {
    if (domainVal.startsWith(".")) {
      return { domain: domainVal, url: null };
    }
    const domainBare = domainVal.replace(/:\d+$/, "");
    return { url: `http://${domainBare}/`, domain: domainBare };
  }
  return null;
}

function syncRemoveBtnState(container) {
  const rows = container.querySelectorAll(".target-row");
  rows.forEach((r) => {
    r.querySelector(".remove-btn").disabled = rows.length === 1;
  });
}

async function cleanupRuleCookies(rule) {
  const keys = rule.keys.map((k) => k.trim()).filter(Boolean);
  for (const target of (rule.targets || [])) {
    let cookies;
    if (target.domain.startsWith(".")) {
      // ワイルドカード: suffix でまとめて取得（サブドメイン含む）
      cookies = await chrome.cookies.getAll({ domain: target.domain.replace(/^\./, "") });
    } else {
      cookies = await chrome.cookies.getAll({ url: target.url });
    }
    const toRemove = keys.length > 0 ? cookies.filter((c) => keys.includes(c.name)) : cookies;
    for (const c of toRemove) {
      const scheme = c.secure ? "https://" : "http://";
      const bare = c.domain.replace(/^\./, "");
      await chrome.cookies.remove({ url: `${scheme}${bare}${c.path || "/"}`, name: c.name });
    }
  }
}

function renderRules(rules) {
  const list = document.getElementById("rules-list");
  const empty = document.getElementById("empty");
  list.innerHTML = "";

  if (!rules || rules.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  rules.forEach((rule, ruleIdx) => {
    const enabled = rule.enabled !== false;
    const li = document.createElement("li");
    if (!enabled) li.classList.add("rule-disabled");

    const meta = document.createElement("div");
    meta.className = "rule-meta";
    const keysText = rule.keys.length > 0 ? rule.keys.join(", ") : "（全て）";
    meta.innerHTML = `<span class="source">${escHtml(rule.sourceDomain)}</span>　<span class="keys">Keys: ${escHtml(keysText)}</span>`;
    li.appendChild(meta);

    const targetList = document.createElement("ul");
    targetList.className = "rule-targets";
    (rule.targets || []).forEach((target) => {
      const item = document.createElement("li");
      item.className = "rule-target-item";
      if (target.domain.startsWith(".")) {
        item.textContent = target.domain;
      } else {
        const parsedUrl = (() => { try { return new URL(target.url); } catch { return null; } })();
        const isUrlDerived = parsedUrl && parsedUrl.hostname === target.domain && parsedUrl.protocol === "http:" && parsedUrl.pathname === "/";
        item.textContent = isUrlDerived ? target.domain : target.url;
      }
      targetList.appendChild(item);
    });
    li.appendChild(targetList);

    const footer = document.createElement("div");
    footer.className = "rule-footer";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = `toggle-btn ${enabled ? "enabled" : "disabled"}`;
    toggleBtn.textContent = enabled ? "同期中" : "無効";
    toggleBtn.addEventListener("click", async () => {
      const nowEnabled = rule.enabled !== false;
      chrome.storage.local.get("rules", async ({ rules: current }) => {
        current[ruleIdx].enabled = !nowEnabled;
        if (nowEnabled) {
          // 無効化 → 同期済み Cookie を削除
          await cleanupRuleCookies(current[ruleIdx]);
        }
        chrome.storage.local.set({ rules: current }, () => renderRules(current));
      });
    });

    const delBtn = document.createElement("button");
    delBtn.className = "delete-rule-btn";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      chrome.storage.local.get("rules", ({ rules: current }) => {
        current.splice(ruleIdx, 1);
        chrome.storage.local.set({ rules: current }, () => renderRules(current));
      });
    });

    const syncNowBtn = document.createElement("button");
    syncNowBtn.className = "sync-now-btn";
    syncNowBtn.textContent = "今すぐ同期";
    syncNowBtn.disabled = !enabled;
    syncNowBtn.addEventListener("click", () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = "同期中…";
      chrome.runtime.sendMessage({ type: "manualSync", rule }, () => {
        syncNowBtn.textContent = "完了";
        setTimeout(() => {
          syncNowBtn.textContent = "今すぐ同期";
          syncNowBtn.disabled = false;
        }, 1500);
      });
    });

    const editBtn = document.createElement("button");
    editBtn.className = "edit-rule-btn";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => {
      chrome.storage.local.get("rules", ({ rules: current }) => {
        enterEditMode(current[ruleIdx], ruleIdx);
      });
    });

    footer.appendChild(syncNowBtn);
    footer.appendChild(toggleBtn);
    footer.appendChild(editBtn);
    footer.appendChild(delBtn);
    li.appendChild(footer);
    list.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("new-target-rows");
  addNewTargetRow(container);

  document.getElementById("add-target-btn").addEventListener("click", () => {
    addNewTargetRow(container);
  });

  chrome.storage.local.get("rules", ({ rules }) => renderRules(rules || []));

  document.getElementById("cancel-edit-btn").addEventListener("click", () => {
    resetForm(container);
  });

  document.getElementById("save-btn").addEventListener("click", () => {
    const sourceDomain = document.getElementById("sourceDomain").value.trim();
    const keysRaw = document.getElementById("keys").value.trim();

    if (!sourceDomain) {
      alert("Source Domain は必須です");
      return;
    }

    const rows = container.querySelectorAll(".target-row");
    const targets = [];
    rows.forEach((row) => {
      const t = resolveTarget(row);
      if (t) targets.push(t);
    });

    if (targets.length === 0) {
      alert("Target を最低1件入力してください");
      return;
    }

    const keys = keysRaw ? keysRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];

    chrome.storage.local.get("rules", ({ rules: current }) => {
      if (editingRuleIndex >= 0) {
        // 既存ルールを上書き（enabled など他フィールドは保持）
        current[editingRuleIndex] = { ...current[editingRuleIndex], sourceDomain, keys, targets };
        chrome.storage.local.set({ rules: current }, () => {
          resetForm(container);
          renderRules(current);
        });
      } else {
        const updated = [...(current || []), { sourceDomain, keys, targets }];
        chrome.storage.local.set({ rules: updated }, () => {
          resetForm(container);
          renderRules(updated);
        });
      }
    });
  });
});
