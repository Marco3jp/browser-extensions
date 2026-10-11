// popup と background の両方から読み込む

// 残すタブの優先度。いま見ているタブ > 他ウィンドウで表示中のタブ > ピン留め
function keepScore(tab, currentWindowId) {
  return (tab.active && tab.windowId === currentWindowId ? 4 : 0) + (tab.active ? 2 : 0) + (tab.pinned ? 1 : 0);
}

// URL が完全に一致するタブをまとめ、2枚以上あるものだけ返す。
// keep は残す候補で、同点なら最後に触ったタブを残す。
function findDuplicateGroups(tabs, currentWindowId) {
  const byUrl = new Map();
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (!byUrl.has(tab.url)) byUrl.set(tab.url, []);
    byUrl.get(tab.url).push(tab);
  }

  const groups = [];
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    const keep = list.reduce((best, tab) => {
      const diff = keepScore(tab, currentWindowId) - keepScore(best, currentWindowId);
      if (diff !== 0) return diff > 0 ? tab : best;
      return (tab.lastAccessed || 0) > (best.lastAccessed || 0) ? tab : best;
    });
    groups.push({ url, tabs: list, keepId: keep.id });
  }
  return groups;
}
