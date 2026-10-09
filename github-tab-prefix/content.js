const RESERVED = new Set([
  "settings", "notifications", "pulls", "issues", "explore", "marketplace",
  "codespaces", "orgs", "organizations", "topics", "search", "sponsors",
  "new", "account", "apps", "features", "about", "pricing", "login",
  "logout", "join", "dashboard", "trending", "collections", "events",
  "users", "site", "contact", "security"
]);

let stripPrefixes = [];
let prefixesLoaded = false;
let last = { path: null, repo: null };

const CONVENTIONAL_TYPES = [
  "feat", "fix", "chore", "docs", "style", "refactor",
  "perf", "test", "build", "ci", "revert"
];

function escapeRegExp(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repoName() {
  const m = location.pathname.match(/^\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  if (RESERVED.has(m[1])) return null;

  const name = m[2];
  const hit = stripPrefixes.find(
    (p) => name.startsWith(p) && name.length > p.length
  );
  return hit ? name.slice(hit.length) : name;
}

function apply() {
  if (!prefixesLoaded) return;
  const repo = repoName();
  if (!repo) return;

  // 設定変更で短縮後の名前が変わったときに、前の名前で付けたものも剥がせるようにする
  const path = location.pathname.split("/").slice(1, 3).join("/");
  const names = [repo];
  if (last.path === path && last.repo !== repo) names.push(last.repo);
  last = { path, repo };
  const own = new RegExp(
    `^(?:${names.map(escapeRegExp).join("|")})(?:\\(([^)]*)\\))?: `
  );
  const conventional = new RegExp(
    `^(?:${CONVENTIONAL_TYPES.join("|")})\\(([^)]+)\\)!?: `
  );

  let base = document.title;
  let scope = null;

  const stripped = base.match(own);
  if (stripped) {
    base = base.slice(stripped[0].length);
    scope = stripped[1] || null;
  }

  const hoisted = base.match(conventional);
  if (hoisted) {
    base = base.slice(hoisted[0].length);
    scope = hoisted[1];
  }

  const next = scope ? `${repo}(${scope}): ${base}` : `${repo}: ${base}`;
  if (document.title !== next) document.title = next;
}

function observeHead(target) {
  new MutationObserver(apply).observe(target, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

if (document.head) {
  observeHead(document.head);
} else {
  const boot = new MutationObserver(() => {
    if (!document.head) return;
    boot.disconnect();
    observeHead(document.head);
    apply();
  });
  boot.observe(document.documentElement, { childList: true });
}

chrome.storage.sync.get({ stripPrefixes: [] }, (items) => {
  stripPrefixes = items.stripPrefixes;
  prefixesLoaded = true;
  apply();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.stripPrefixes) return;
  stripPrefixes = changes.stripPrefixes.newValue || [];
  apply();
});

document.addEventListener("turbo:load", apply);
window.addEventListener("popstate", apply);
apply();
