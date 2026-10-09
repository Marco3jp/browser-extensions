// --- Icon generation ---

const COLORS = {
  gray:   [150, 150, 150],
  green:  [  0, 180,  80],
  yellow: [210, 170,   0],
  orange: [255, 140,   0],
  red:    [220,  50,  50],
  blue:   [ 30, 120, 220],
  purple: [140,  60, 200],
};

function makeIcon(r, g, b) {
  const size = 16;
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = (size - 1) / 2, cy = (size - 1) / 2, radius = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= radius) {
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
      }
    }
  }
  return new ImageData(data, size, size);
}

function makeCompositeIcon(mr, mg, mb, ar, ag, ab) {
  const size = 16;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const mainDist   = Math.sqrt((x - 6)  ** 2 + (y - 6)  ** 2);
      const accentDist = Math.sqrt((x - 12) ** 2 + (y - 12) ** 2);
      if (accentDist <= 4) {
        const [r, g, b] = accentDist >= 3 ? [255, 255, 255] : [ar, ag, ab];
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
      } else if (mainDist <= 5.5) {
        data[idx] = mr; data[idx + 1] = mg; data[idx + 2] = mb; data[idx + 3] = 255;
      }
    }
  }
  return new ImageData(data, size, size);
}

const ICONS = {
  ...Object.fromEntries(Object.entries(COLORS).map(([n, [r, g, b]]) => [n, makeIcon(r, g, b)])),
  green_deduped: makeCompositeIcon(  0, 180,  80, 210, 170, 0),
  blue_deduped:  makeCompositeIcon( 30, 120, 220, 210, 170, 0),
};

function setTabIcon(tabId, colorName) {
  const imageData = { 16: ICONS[colorName] ?? ICONS.gray };
  if (tabId != null) {
    chrome.action.setIcon({ imageData, tabId }, () => { void chrome.runtime.lastError; });
  } else {
    chrome.action.setIcon({ imageData });
  }
}

// --- Helpers ---

// --- Rules cache ---

let _rulesCache = null;

async function getRules() {
  if (_rulesCache !== null) return _rulesCache;
  const { rules } = await chrome.storage.local.get("rules");
  _rulesCache = rules ?? [];
  return _rulesCache;
}

function invalidateRulesCache() {
  _rulesCache = null;
}

function domainMatches(hostname, pattern) {
  const bare = pattern.replace(/^\./, "");
  return hostname === bare || hostname.endsWith(`.${bare}`);
}

function isWildcardTarget(domain) {
  return domain.startsWith(".");
}

// --- Status determination ---
// Returns { status: string, duplicates: Array<{ name, domain, removeUrl }> }

async function getTabStatus(url) {
  let urlObj;
  try { urlObj = new URL(url); } catch { return { status: "gray", duplicates: [] }; }
  if (!urlObj.protocol.startsWith("http")) return { status: "gray", duplicates: [] };

  const hostname = urlObj.hostname;
  const rules = await getRules();
  if (!rules || rules.length === 0) return { status: "gray", duplicates: [] };

  // 全 targets の中からホスト名が一致するものを抽出
  const matchingPairs = [];
  for (const rule of rules) {
    for (const target of (rule.targets || [])) {
      if (domainMatches(hostname, target.domain)) matchingPairs.push({ rule, target });
    }
  }

  if (matchingPairs.length > 0) {
    const now = Date.now() / 1000;
    let hasValid = false, hasExpired = false, hasMissing = false;
    const duplicates = [];
    const mismatchedRules = new Set();

    for (const { rule, target } of matchingPairs) {
      const keys = rule.keys.map((k) => k.trim()).filter(Boolean);

      const effectiveUrl = isWildcardTarget(target.domain) ? url : target.url;

      // 有効性チェック: ワイルドカードは url ベース（.dev.example.com スコープの Cookie を拾うため）、非ワイルドカードは domain ベース
      const domainCookies = isWildcardTarget(target.domain)
        ? await chrome.cookies.getAll({ url })
        : await chrome.cookies.getAll({ domain: target.domain });
      const relevant = keys.length > 0 ? domainCookies.filter((c) => keys.includes(c.name)) : domainCookies;

      if (relevant.length === 0) { hasMissing = true; continue; }

      const validRelevant = [];
      for (const c of relevant) {
        if (!c.expirationDate || c.expirationDate > now) { hasValid = true; validRelevant.push(c); }
        else hasExpired = true;
      }

      // 値の一致チェック: source側の現在値と異なれば自動sync
      // ワイルドカードターゲットの場合、親ドメイン継承Cookieを除外してターゲットドメイン所属のCookieのみ比較する
      if (validRelevant.length > 0) {
        const sourceBare = rule.sourceDomain.replace(/^\./, "");
        // getAll({domain}) はサブドメインも含めて返すため、source 本体に所属する Cookie だけに絞る
        const allFromSourceScope = await chrome.cookies.getAll({ domain: sourceBare });
        const sourceCookies = allFromSourceScope.filter((c) => {
          const cd = c.domain.replace(/^\./, "");
          return cd === sourceBare;
        });
        const targetSuffix = isWildcardTarget(target.domain) ? target.domain.replace(/^\./, "") : null;
        for (const tgt of validRelevant) {
          if (targetSuffix) {
            const cookieDomain = tgt.domain.replace(/^\./, "");
            if (cookieDomain !== targetSuffix && !cookieDomain.endsWith(`.${targetSuffix}`)) continue;
          }
          const src = sourceCookies.find((c) => c.name === tgt.name);
          if (src && src.value !== tgt.value) { mismatchedRules.add(rule); break; }
        }
      }

      // 重複チェック: url ベースで取得（実際にサーバーへ送信される Cookie を確認）
      const urlCookies = await chrome.cookies.getAll({ url: effectiveUrl });
      const checkKeys = keys.length > 0 ? keys : [...new Set(urlCookies.map((c) => c.name))];
      for (const key of checkKeys) {
        const sameKey = urlCookies.filter((c) => c.name === key);
        if (sameKey.length <= 1) continue;
        if (sameKey.every((c) => c.value === sameKey[0].value)) continue;
        for (const c of sameKey) {
          const scheme = c.secure ? "https://" : "http://";
          const bare = c.domain.replace(/^\./, "");
          if (!duplicates.some((d) => d.name === c.name && d.domain === c.domain)) {
            duplicates.push({ name: c.name, domain: c.domain, path: c.path, removeUrl: `${scheme}${bare}${c.path || "/"}` });
          }
        }
      }
    }

    for (const rule of mismatchedRules) manualSyncRule(rule);

    let status;
    if      (hasValid && !hasExpired && !hasMissing) status = duplicates.length > 0 ? "green_deduped" : "green";
    else if (hasValid && (hasExpired || hasMissing)) status = "yellow";
    else if (!hasValid && hasExpired)                status = "orange";
    else                                             status = "red";

    return { status, duplicates };
  }

  const sourceRules = rules.filter((rule) => domainMatches(hostname, rule.sourceDomain));
  if (sourceRules.length > 0) {
    // url ベースで取得することで親ドメイン Cookie も含めて重複を検出できる
    const allCookies = await chrome.cookies.getAll({ url });
    let hasRelevant = false;
    const duplicates = [];

    for (const rule of sourceRules) {
      const keys = rule.keys.map((k) => k.trim()).filter(Boolean);
      const relevant = keys.length > 0 ? allCookies.filter((c) => keys.includes(c.name)) : allCookies;
      if (relevant.length > 0) hasRelevant = true;

      const checkKeys = keys.length > 0 ? keys : [...new Set(allCookies.map((c) => c.name))];
      for (const key of checkKeys) {
        const sameKey = allCookies.filter((c) => c.name === key);
        if (sameKey.length <= 1) continue;
        if (sameKey.every((c) => c.value === sameKey[0].value)) continue;
        for (const c of sameKey) {
          const scheme = c.secure ? "https://" : "http://";
          const bare = c.domain.replace(/^\./, "");
          if (!duplicates.some((d) => d.name === c.name && d.domain === c.domain)) {
            duplicates.push({ name: c.name, domain: c.domain, path: c.path, removeUrl: `${scheme}${bare}${c.path || "/"}` });
          }
        }
      }
    }

    if (!hasRelevant) return { status: "purple", duplicates: [] };
    return { status: duplicates.length > 0 ? "blue_deduped" : "blue", duplicates };
  }

  return { status: "gray", duplicates: [] };
}

async function updateIconForTab(tabId, url) {
  const { status } = await getTabStatus(url || "").catch(() => ({ status: "gray" }));
  setTabIcon(tabId, status);
}

// --- Tab event listeners ---

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) updateIconForTab(tab.id, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) updateIconForTab(tabId, tab.url);
});

chrome.storage.onChanged.addListener(() => {
  invalidateRulesCache();
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) updateIconForTab(tab.id, tab.url);
  });
});

// --- syncRuleToHost: Source Cookie を特定ホストへ一括同期 ---

async function syncRuleToHost(rule, domainBare, targetUrl) {
  const sourceBare = rule.sourceDomain.replace(/^\./, "");
  if (domainBare === sourceBare) return;
  // getAll({domain}) はサブドメインも返すため、source 本体所属のものだけに絞る
  const allFromSourceScope = await chrome.cookies.getAll({ domain: sourceBare });
  const sourceCookies = allFromSourceScope.filter((c) => c.domain.replace(/^\./, "") === sourceBare);
  const keys = rule.keys.map((k) => k.trim()).filter(Boolean);

  for (const cookie of sourceCookies) {
    if (keys.length > 0 && !keys.includes(cookie.name)) continue;
    const effectiveUrl = targetUrl ?? `${cookie.secure ? "https" : "http"}://${domainBare}/`;
    const isSecure = effectiveUrl.startsWith("https://");
    // 無駄書き込み抑制: target に既に同値があればスキップ
    const existing = await chrome.cookies.getAll({ url: effectiveUrl, name: cookie.name });
    const sameHostExisting = existing.find((c) => c.domain.replace(/^\./, "") === domainBare);
    if (sameHostExisting && sameHostExisting.value === cookie.value) continue;
    const params = {
      url: effectiveUrl,
      name: cookie.name,
      value: cookie.value,
      domain: domainBare,
      path: cookie.path,
      secure: isSecure,
      sameSite: isSecure ? "no_restriction" : "lax",
      httpOnly: cookie.httpOnly,
    };
    if (cookie.expirationDate) params.expirationDate = cookie.expirationDate;
    try {
      const result = await chrome.cookies.set(params);
      if (!result) console.error("[CookieSyncRelay] syncRuleToHost: failed to set cookie", cookie.name, "→", domainBare);
    } catch (e) {
      console.error("[CookieSyncRelay] syncRuleToHost: error setting cookie", cookie.name, "→", domainBare, e.message);
    }
  }
}

// --- Manual sync ---

const _syncingRules = new Set();

async function manualSyncRule(rule, { force = false } = {}) {
  if (rule.enabled === false) return;
  if (!force && _syncingRules.has(rule.sourceDomain)) return;
  _syncingRules.add(rule.sourceDomain);
  try {
    const allTabs = await chrome.tabs.query({});

    for (const target of (rule.targets || [])) {
      if (isWildcardTarget(target.domain)) {
        const suffix = target.domain.replace(/^\./, "");
        await syncRuleToHost(rule, suffix, null);
      } else {
        const domainBare = target.domain.replace(/:\d+$/, "");
        await syncRuleToHost(rule, domainBare, target.url);
      }
      for (const tab of allTabs) {
        if (!tab.url) continue;
        let hostname;
        try { hostname = new URL(tab.url).hostname; } catch { continue; }
        if (domainMatches(hostname, target.domain)) updateIconForTab(tab.id, tab.url);
      }
    }
  } finally {
    _syncingRules.delete(rule.sourceDomain);
  }
}

// --- Message listener (for popup) ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getTabStatus") {
    getTabStatus(message.url).then(sendResponse);
    return true;
  }
  if (message.type === "manualSync") {
    manualSyncRule(message.rule, { force: true }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// --- Cookie sync ---

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.removed) return;
  syncCookie(changeInfo.cookie);
});

async function syncCookie(cookie) {
  const rules = await getRules();
  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (!domainMatches(cookie.domain.replace(/^\./, ""), rule.sourceDomain)) continue;

    const keys = rule.keys.map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0 && !keys.includes(cookie.name)) continue;

    // ループ防止: cookie の domain が同 rule のどれかの target に該当するなら、
    // それは target 由来の書き込みなので source からの伝播対象ではない
    const cookieBare = cookie.domain.replace(/^\./, "");
    const fromTarget = (rule.targets || []).some((t) => {
      const tBare = t.domain.replace(/^\./, "").replace(/:\d+$/, "");
      return cookieBare === tBare || cookieBare.endsWith(`.${tBare}`);
    });
    if (fromTarget) continue;

    for (const target of (rule.targets || [])) {
      if (isWildcardTarget(target.domain)) {
        const suffix = target.domain.replace(/^\./, "");
        // ループ防止: Target ドメインから来た変更は無視
        const targetVariants = [suffix, `.${suffix}`];
        if (targetVariants.some((d) => cookie.domain === d)) continue;
        const isSecure = cookie.secure;
        const targetUrl = `${isSecure ? "https" : "http"}://${suffix}/`;
        // 無駄書き込み抑制: target に既に同値の Cookie があればスキップ
        const existing = await chrome.cookies.getAll({ url: targetUrl, name: cookie.name });
        const sameHostExisting = existing.find((c) => c.domain.replace(/^\./, "") === suffix);
        if (sameHostExisting && sameHostExisting.value === cookie.value) continue;
        const params = {
          url: targetUrl,
          name: cookie.name,
          value: cookie.value,
          domain: suffix,
          path: cookie.path,
          secure: isSecure,
          sameSite: isSecure ? "no_restriction" : "lax",
          httpOnly: cookie.httpOnly,
        };
        if (cookie.expirationDate) params.expirationDate = cookie.expirationDate;
        try {
          const result = await chrome.cookies.set(params);
          if (!result) console.error("[CookieSyncRelay] autoSync: failed to set cookie", cookie.name, "→", suffix);
        } catch (e) {
          console.error("[CookieSyncRelay] autoSync: error setting cookie", cookie.name, "→", suffix, e.message);
        }
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (!tab.url) continue;
            let hostname;
            try { hostname = new URL(tab.url).hostname; } catch { continue; }
            if (domainMatches(hostname, target.domain)) updateIconForTab(tab.id, tab.url);
          }
        });
      } else {
        const domainBare = target.domain.replace(/:\d+$/, "");
        // ループ防止: Target ドメインから来た変更は無視
        const targetVariants = [domainBare, `.${domainBare}`];
        if (targetVariants.some((d) => cookie.domain === d)) continue;

        const isSecure = target.url.startsWith("https://");
        // 無駄書き込み抑制: target に既に同値の Cookie があればスキップ
        const existing = await chrome.cookies.getAll({ url: target.url, name: cookie.name });
        const sameHostExisting = existing.find((c) => c.domain.replace(/^\./, "") === domainBare);
        if (sameHostExisting && sameHostExisting.value === cookie.value) continue;
        const params = {
          url: target.url,
          name: cookie.name,
          value: cookie.value,
          domain: domainBare,
          path: cookie.path,
          secure: isSecure,
          sameSite: isSecure ? "no_restriction" : "lax",
          httpOnly: cookie.httpOnly,
        };
        if (cookie.expirationDate) params.expirationDate = cookie.expirationDate;

        try {
          const result = await chrome.cookies.set(params);
          if (!result) console.error("[CookieSyncRelay] autoSync: failed to set cookie", cookie.name, "→", domainBare);
        } catch (e) {
          console.error("[CookieSyncRelay] autoSync: error setting cookie", cookie.name, "→", domainBare, e.message);
        }

        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (!tab.url) continue;
            let hostname;
            try { hostname = new URL(tab.url).hostname; } catch { continue; }
            if (domainMatches(hostname, target.domain)) updateIconForTab(tab.id, tab.url);
          }
        });
      }
    }
  }
}
