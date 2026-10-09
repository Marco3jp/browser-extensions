# highlight-crawlable-anchors

ページ上のリンクをクロール可否に応じてハイライト表示する Chrome 拡張機能。

## スクリーンショット

ポップアップから「ハイライト表示」を押すと、ページ上のリンクが以下の色で色分けされる。

- **緑** — クロール可能なリンク
- **赤** — 何らかの理由でクロールされないリンク

リンクにホバーすると、ブロック理由を示すツールチップが表示される。

## 判定ロジック

以下のリソースを参照してクロール可否を判定する。

| リソース | 説明 |
|---|---|
| `robots.txt` | 同一オリジンのリンク先 URL が `Disallow` に一致する場合はクロール不可とみなす。`User-agent: *` と `googlebot` ブロックに対応し、`Allow` による上書きも考慮する。 |
| `rel="nofollow"` | アンカーの `rel` 属性に `nofollow` が含まれる場合。 |
| `rel="ugc"` | Google が nofollow ヒントとして扱うため同様に検出。 |
| `rel="sponsored"` | 同上。 |
| `<meta name="robots" content="nofollow">` / `content="none"` | ページ全体のリンクフォロー禁止。 |
| `<meta name="googlebot">` | Googlebot 専用の nofollow 制御も加味。 |

> **補足**: `noindex` はページのインデックスを禁止するだけでリンクのフォロー自体は止まらないため、クロール可否の判定には含めていない（Google の仕様に準拠）。

## 技術スタック

- Vite
- TypeScript
- Chrome Extensions Manifest V3

## セットアップ

```bash
npm install
npm run build
```

`dist/` ディレクトリが生成される。

## Chrome への導入

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist/` フォルダを選択する

## 使い方

1. 拡張機能のアイコンをクリックしてポップアップを開く
2. 「ハイライト表示」ボタンを押すとページ上のリンクが色分けされる
3. リンクにホバーするとクロール可否の理由がツールチップで確認できる
4. 「ハイライト解除」で元の表示に戻る
