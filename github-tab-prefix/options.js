const textarea = document.getElementById("prefixes");
const status = document.getElementById("status");

chrome.storage.sync.get({ stripPrefixes: [] }, (items) => {
  textarea.value = items.stripPrefixes.join("\n");
});

document.getElementById("save").addEventListener("click", () => {
  const stripPrefixes = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  chrome.storage.sync.set({ stripPrefixes }, () => {
    status.textContent = "保存しました";
    setTimeout(() => { status.textContent = ""; }, 1500);
  });
});
