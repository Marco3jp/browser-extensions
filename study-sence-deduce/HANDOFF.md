# HANDOFF — 引き継ぎ資料

> セッションをまたいで開発するための引き継ぎメモ。**作業終了時に必ず更新すること。**
> 開始時はこのファイル → `PLAN.md` の順で読む。

## 現在地

- M0〜M3 の基本機能を実装済み。`npm run build` で `dist/` が生成される（Chrome の「パッケージ化されていない拡張機能を読み込む」で `dist/` を指定）。
- 実装済みファイル
  - 足場: `package.json` / `tsconfig.json` / `vite.config.ts` / `public/manifest.json`
  - 共通: `src/types.ts` / `src/storage.ts` / `src/env-match.ts`
  - M0 設定: `options.html` / `src/options.ts`
  - M1 リボン: `src/content.ts`（左下に斜めリボン、Shadow DOMで隔離）
  - M2 スイッチャー: `popup.html` / `src/popup.ts`
  - M3 テンプレURL: `templates.html` / `src/templates.ts`

## 次の一手

- 実機での動作確認（dev / stg / prod の架空ホストでEnvironmentSetを登録し、リボン表示・スイッチ・テンプレ呼び出しの3機能を一通り検証）。
- 動作確認の過程で出た不具合・違和感の修正。
- 後回しにした以下の項目を、実利用しながら必要性を見極めて着手する:
  - テンプレURLの「タグ別画面」（タグ起点で一覧する別画面 or 同画面のサイドフィルタ）
  - リボンの非表示トグル・位置変更（必要性が出てきたら）
  - 設定のインポート/エクスポート（端末跨ぎ運用の必要が出たら）

## 決定事項

- Chrome拡張（Manifest V3）、vite + TypeScript 構成。
- 永続化は `chrome.storage.local`（Storeリリース予定なし・端末跨ぎ要件なしのため `sync` は使わない）。
- EnvironmentSet と現在URLの紐付け: **完全自動判定**。複数セットに渡って先頭ヒットを採用。手動上書きはやらない（裏設定化を避ける）。
- `hostPattern` のワイルドカード仕様: `*` は **複数ラベル可**（ドット越えOK）。
  - パターンが `:port` を含めば一致必須。含まなければポート無視。
  - `localhost:3000` のようにポート単独指定でも書ける（プロジェクト毎にポートで区別する用途）。
- リボン: **左下に斜め45度**で固定。prod も常に表示（色で警告）。Esc非表示は作らない。
- テンプレURL: パス + クエリ + ハッシュを保存。**EnvironmentSet に紐づく**形（呼び出し時は当該セットの各環境ボタンを並べる）。
- テンプレ検索: ラベル + メモ + タグの単純な部分一致インクリメンタル検索。最終使用順で表示。

## 未決事項

- テンプレURLの **タグ別画面** の操作感。タグ起点で運用が必要になってから設計する。
- EnvironmentSet を **跨ぐテンプレ呼び出し** の必要性（現状は紐づくセットの環境のみ呼べる）。
- リボンの **iframe対応**（content scriptは全フレームには注入していない。`manifest.json` の `content_scripts` に `all_frames` を入れるかは要検討）。

## ログ（新しい順）

- 2026-06-11: M0〜M3 を一括実装。基本機能の動作確認は実機検証待ち。`dist/` ビルド成功、tsc型チェック clean。
- 2026-06-09: プロジェクト発足。`PLAN.md` と本ファイルを作成。技術構成を `highlight-crawlable-anchors` に倣い vite + TS に決定。
