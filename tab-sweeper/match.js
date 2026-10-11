// 検索語からタブの判定関数を作る。正規表現が不正なら例外を投げる。
// 大文字小文字は区別しない。
function buildMatcher(query, { field = "both", regex = false } = {}) {
  let test;
  if (regex) {
    const re = new RegExp(query, "i");
    test = (s) => re.test(s);
  } else {
    const needle = query.toLowerCase();
    test = (s) => s.toLowerCase().includes(needle);
  }
  return (tab) =>
    (field !== "title" && test(tab.url || "")) || (field !== "url" && test(tab.title || ""));
}
