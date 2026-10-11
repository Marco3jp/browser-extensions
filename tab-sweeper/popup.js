let allTabs = [];
let currentWindowId;

// --- Tab switching ---

document.querySelectorAll(".tab-bar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-bar button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "search") document.getElementById("query").focus();
  });
});

// --- Shared ---

function tabMeta(tab) {
  return [tab.pinned && "ピン", tab.active && "表示中", `W${tab.windowId}`].filter(Boolean).join(" · ");
}

// チェックボックスやラジオ + タイトル (+ URL) + メタ情報の1行を作る
function tabRow(tab, input, { showUrl = false } = {}) {
  const row = document.createElement("label");
  row.className = "tab-row";

  const text = document.createElement("span");
  text.className = "tab-text";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url;
  title.title = tab.title || tab.url;
  text.appendChild(title);

  if (showUrl) {
    const url = document.createElement("span");
    url.className = "tab-url";
    url.textContent = tab.url;
    url.title = tab.url;
    text.appendChild(url);
  }

  const meta = document.createElement("span");
  meta.className = "tab-meta";
  meta.textContent = tabMeta(tab);

  row.appendChild(input);
  row.appendChild(text);
  row.appendChild(meta);
  return row;
}

async function closeTabs(ids) {
  if (ids.length > 0) await chrome.tabs.remove(ids);
  await load();
}

// --- Duplicates tab ---

// URL ごとに、ユーザーがラジオで選び直した「残すタブ」の id
const keepOverrides = new Map();

function keepIdOf(group) {
  const override = keepOverrides.get(group.url);
  return group.tabs.some((t) => t.id === override) ? override : group.keepId;
}

function closeGroups(groups) {
  return closeTabs(
    groups.flatMap((g) => {
      const keepId = keepIdOf(g);
      return g.tabs.filter((t) => t.id !== keepId).map((t) => t.id);
    })
  );
}

function renderDuplicates() {
  const groups = findDuplicateGroups(allTabs, currentWindowId);
  const closable = groups.reduce((sum, g) => sum + g.tabs.length - 1, 0);

  document.getElementById("dup-summary").textContent =
    closable > 0 ? `${groups.length} 件の URL で ${closable} 枚閉じられます` : "";
  const closeAllBtn = document.getElementById("close-all-dup-btn");
  closeAllBtn.disabled = closable === 0;
  closeAllBtn.onclick = () => closeGroups(groups);
  document.getElementById("dup-empty").style.display = closable === 0 ? "block" : "none";

  const list = document.getElementById("groups");
  list.innerHTML = "";
  groups.forEach((group) => {
    const keepId = keepIdOf(group);
    const li = document.createElement("li");
    li.className = "group";

    const head = document.createElement("div");
    head.className = "group-head";

    const url = document.createElement("span");
    url.className = "group-url";
    url.textContent = group.url;
    url.title = group.url;

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-group-btn";
    closeBtn.textContent = `${group.tabs.length - 1} 枚閉じる`;
    closeBtn.addEventListener("click", () => closeGroups([group]));

    head.appendChild(url);
    head.appendChild(closeBtn);
    li.appendChild(head);

    group.tabs.forEach((tab) => {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `keep-${group.url}`;
      radio.checked = tab.id === keepId;
      radio.title = "残すタブ";
      radio.addEventListener("change", () => {
        keepOverrides.set(group.url, tab.id);
        renderDuplicates();
      });

      const row = tabRow(tab, radio);
      if (tab.id !== keepId) row.classList.add("closing");
      li.appendChild(row);
    });

    list.appendChild(li);
  });
}

// --- Search tab ---

// 一致したタブは既定で選択済み。外したものだけ覚えておく
const deselected = new Set();
let matchedTabs = [];

function selectedMatches() {
  return matchedTabs.filter((t) => !deselected.has(t.id));
}

function updateSearchSummary() {
  const selected = selectedMatches().length;
  document.getElementById("search-summary").textContent =
    matchedTabs.length > 0 ? `${matchedTabs.length} 枚一致 / ${selected} 枚選択中` : "";
  document.getElementById("close-matches-btn").disabled = selected === 0;
  const selectAll = document.getElementById("select-all");
  selectAll.checked = selected === matchedTabs.length;
  selectAll.indeterminate = selected > 0 && selected < matchedTabs.length;
}

function renderSearch() {
  const query = document.getElementById("query").value.trim();
  const errorEl = document.getElementById("regex-error");
  const list = document.getElementById("matches");
  list.innerHTML = "";
  errorEl.style.display = "none";
  matchedTabs = [];

  if (query) {
    let matcher;
    try {
      matcher = buildMatcher(query, {
        field: document.getElementById("field").value,
        regex: document.getElementById("regex").checked,
      });
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.style.display = "block";
    }
    if (matcher) {
      const skipPinned = document.getElementById("skip-pinned").checked;
      matchedTabs = allTabs.filter((t) => !(skipPinned && t.pinned) && matcher(t));
    }
  }

  document.getElementById("select-all-row").style.display = matchedTabs.length > 0 ? "block" : "none";

  matchedTabs.forEach((tab) => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !deselected.has(tab.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) deselected.delete(tab.id);
      else deselected.add(tab.id);
      updateSearchSummary();
    });

    const li = document.createElement("li");
    li.appendChild(tabRow(tab, checkbox, { showUrl: true }));
    list.appendChild(li);
  });

  updateSearchSummary();
}

for (const id of ["query", "field", "regex", "skip-pinned"]) {
  document.getElementById(id).addEventListener("input", renderSearch);
}

document.getElementById("select-all").addEventListener("change", (e) => {
  for (const tab of matchedTabs) {
    if (e.target.checked) deselected.delete(tab.id);
    else deselected.add(tab.id);
  }
  renderSearch();
});

document.getElementById("close-matches-btn").addEventListener("click", () => {
  closeTabs(selectedMatches().map((t) => t.id));
});

// --- Load ---

async function load() {
  const [tabs, win] = await Promise.all([chrome.tabs.query({}), chrome.windows.getCurrent()]);
  allTabs = tabs;
  currentWindowId = win.id;
  renderDuplicates();
  renderSearch();
}

load();
