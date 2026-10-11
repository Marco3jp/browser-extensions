importScripts("dedupe.js");

// 閉じられるタブの枚数をバッジに出す
async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const count = findDuplicateGroups(tabs).reduce((sum, g) => sum + g.tabs.length - 1, 0);
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#dc3232" });
  updateBadge();
});
chrome.runtime.onStartup.addListener(updateBadge);
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onReplaced.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url) updateBadge();
});
