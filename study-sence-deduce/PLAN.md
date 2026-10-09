# study-sence-deduce 開発計画

開発環境向けの便利ツール。Chrome拡張機能（Manifest V3）として実装する。

## 目的

dev / stg / prod といった複数環境を行き来しながら開発・確認する作業を快適にする。次の3機能を提供する。

1. **環境リボン** — 現在のページが dev / stg / prod のどれかを、画面固定のリボンで一目で分からせる。
2. **環境スイッチャー** — サブドメイン等を切り替えて、同一パスのページを別環境で即座に開き直す。
3. **テンプレURL保存** — パス部分を中心にURLを保存し、メモ・ラベルで検索して目的のページをすぐ呼び出す。

## 技術方針

同じリポジトリの `highlight-crawlable-anchors` に揃える（vite + TypeScript構成）。

- **Manifest V3** のChrome拡張。
- **TypeScript + Vite**。`@types/chrome` を利用。ビルドは `vite build`、開発は `vite build --watch`。
- `public/manifest.json` を静的配置（`dist` へコピーされる）。
- エントリは vite の `rollupOptions.input` に列挙。出力は `dist/[name].js`。
- 永続化は `chrome.storage`（端末間同期する設定は `sync`、ローカル限定は `local`）。

### 想定ファイル構成

```
study-sence-deduce/
├── package.json            # build / dev スクリプト、devDeps: vite, typescript, @types/chrome
├── tsconfig.json
├── vite.config.ts          # input: popup.html, options.html, src/content.ts, src/background.ts
├── popup.html              # スイッチャー + テンプレURL のUI
├── options.html            # 環境セット設定UI
├── public/
│   └── manifest.json
├── src/
│   ├── env-match.ts        # ★共通ロジック: ホスト照合・ホスト差し替え
│   ├── storage.ts          # chrome.storage ラッパ（型付き）
│   ├── content.ts          # 環境リボン差し込み
│   ├── popup.ts            # スイッチャー / テンプレURL
│   ├── options.ts          # 環境セット設定
│   └── types.ts            # EnvironmentSet 等の型定義
└── dist/                   # ビルド成果物（拡張として読み込む対象）
```

## 中核となる共通概念: 環境セット（EnvironmentSet）

3機能はすべて「どのホストがどの環境か」という定義に依存する。これを共通設定として一元管理し、ロジックを `src/env-match.ts` に集約する。

```ts
type EnvKey = string; // "dev" | "stg" | "prod" | 任意

interface Env {
  key: EnvKey;
  label: string;        // リボン表示文言
  color: string;        // リボン色
  hostPattern: string;  // マッチ用パターン（既定: "*.dev.example.com" 形式のワイルドカード）
  hostTemplate: string; // スイッチ先生成用ホスト（例: "app.dev.example.com"）
}

interface EnvironmentSet {
  id: string;
  name: string;         // 表示名（例: "My App"）
  environments: Env[];
}
```

- **リボン**: 現在URLのホストを各 `hostPattern` で照合し、該当 `Env` の `label`/`color` を表示。
- **スイッチャー**: 現在ホストがどの `Env` かを判定し、同一 `EnvironmentSet` 内の他 `Env` の `hostTemplate` にホストだけ差し替え。パス・クエリ・ハッシュは保持。
- **テンプレURL**: 保存時にホストを除いたパス＋クエリを保持。呼び出し時に現在環境のホストへ乗せて開く（環境非依存で再利用可）。

`hostPattern` のマッチ方式は **`*.dev.example.com` 形式のワイルドカード独自実装**を既定とする（直感的・誤爆しにくい）。必要になれば正規表現/完全一致を再検討。

## 開発の進め方（セッション分割前提）

各機能は別セッションで実装しうる。1セッション完結を意識し、毎回 `HANDOFF.md` を更新してから終える。

### マイルストーン

- **M0 足場づくり** … vite/ts/manifest の雛形、`types.ts`・`storage.ts`・`env-match.ts`、`options` での EnvironmentSet 設定UI。3機能の土台なので最優先。
- **M1 環境リボン** … `content.ts` でリボン差し込み。M0の設定から色・文言を反映。
- **M2 環境スイッチャー** … `popup.ts` で現在タブURLを取得し他環境へ開き直す。
- **M3 テンプレURL保存** … 保存・ラベル/メモ検索・呼び出し。

依存は M0 → M1/M2/M3。M1〜M3 は M0 完了後は独立着手可能。

### セッション運用ルール

1. 開始時に `HANDOFF.md` → `PLAN.md` の順で読む。
2. 着手するマイルストーンを1つ選ぶ。
3. 終了時に `HANDOFF.md` の「現在地 / 次の一手 / 決定事項 / 未決事項 / ログ」を更新する。

## 詳細仕様

各機能の詳細は実装着手時に切り出す。

- `docs/feature-ribbon.md`
- `docs/feature-switcher.md`
- `docs/feature-template-url.md`
