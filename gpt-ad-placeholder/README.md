# GPT Ad Slot Placeholder

`div-gpt-ad-*` な ID を持つ DOM が GPT (Google Publisher Tag) によって広告に置換されるまでの間、黄色いハッチングのモックを表示する Chrome 拡張機能です。開発環境で広告が落札できず枠が見えなくなる問題を解消します。

## インストール

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このディレクトリ (`gpt-ad-placeholder`) を選択

## 仕組み

- `document_start` で content script を注入
- `MutationObserver` で `div[id^="div-gpt-ad-"]` を監視し、初期状態を「待機中」(黄)で表示
- `manifest.json` の `content_scripts.world: "MAIN"` で `page-hook.js` をページコンテキストにロード (CSP 回避のため `<script>` 直挿しはしない) し、`googletag.pubads()` の以下イベントを購読
  - `slotRequested` → 「広告リクエスト中」(青ハッチ・枠オーバーレイ)
  - `slotRenderEnded` (`isEmpty=true`) → 「未落札 (No Fill)」(赤ハッチ・枠オーバーレイ)
  - `slotRenderEnded` (`isEmpty=false`) / `slotOnload` → オーバーレイは外し、枠を `position:relative; z-index:0` で **stacking context 化**したうえで、「広告表示中（のはず）」の緑のハッチを **子要素として `position:absolute; inset:0; z-index:-1` で広告 iframe の裏側に敷く**。広告が正常に描画されれば iframe に覆われて見えないので普段は無害。何らかの理由で iframe が空・透明な状態だと裏のハッチが透けて見え、「ここに広告が出ているはず」と気づける
- 撤去判定は `iframe` の有無ではなく GPT のレンダリングイベントを根拠にしているので、未落札時に誤って消えることはない

## 注意

- `<all_urls>` にマッチします。本番含めて常時動くので、必要に応じて `manifest.json` の `matches` を絞ってください (例: `*://*.example.com/*`)。
- `all_frames: true` なので iframe 内の広告枠でも動作します。
