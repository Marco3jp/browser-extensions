# Cookie Sync Relay

Dev/Staging 環境のセッション Cookie をローカル開発環境へ自動同期する Chrome 拡張機能。

ブラウザで Staging にログインするだけで、設定した同期先（localhost や dev.local など）に Cookie が自動転送され、手動コピーの手間をなくす。

---

## 目次

- [インストール](#インストール)
- [使い方](#使い方)
  - [ルールの設定](#ルールの設定)
  - [ステータスアイコン](#ステータスアイコン)
  - [ポップアップのステータスタブ](#ポップアップのステータスタブ)
  - [同期の有効化・無効化](#同期の有効化無効化)
- [アーキテクチャ](#アーキテクチャ)
  - [ファイル構成](#ファイル構成)
  - [データモデル](#データモデル)
  - [同期フロー](#同期フロー)
  - [ステータス判定ロジック](#ステータス判定ロジック)
  - [アイコン生成](#アイコン生成)
  - [popup ↔ background 通信](#popup--background-通信)
  - [既知の制約](#既知の制約)

---

## インストール

1. Chrome で `chrome://extensions` を開く
2. 右上の **「デベロッパーモード」をオン** にする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. このリポジトリの `cookie-sync-relay/` ディレクトリを選択

---

## 使い方

### ルールの設定

拡張機能アイコンをクリックし、**設定タブ** を開いてルールを追加する。

| フィールド | 説明 | 例 |
|---|---|---|
| **Source Domain** | 同期元となるドメイン。先頭に `.` を付けるとサブドメインも対象になる | `.staging.example.com` |
| **Cookie Keys** | 同期対象のキー名（カンマ区切り）。空欄にすると全 Cookie を同期する | `_session, token` |
| **Targets** | 同期先。URL か Domain のどちらか片方を入力する（入力すると他方が無効化される） | URL: `http://localhost:3000` または Domain: `localhost` |

Target は「＋ Target 追加」ボタンで複数登録でき、全ての Target へ同時に同期される。

URL を入力した場合はそこからホスト名を自動導出する。Domain のみ入力した場合は `http://{domain}/` を URL として使用する。

### ステータスアイコン

開いているページに応じてアイコンの色が変わる。

| 色 | 意味 |
|---|---|
| 緑 | Target ページ。同期済み Cookie がすべて有効 |
| 緑＋黄ドット | Target ページ。有効だが同一キーの Cookie が複数ドメインスコープに存在（競合の可能性） |
| 黄 | Target ページ。有効な Cookie と期限切れの Cookie が混在 |
| 橙 | Target ページ。同期済み Cookie がすべて期限切れ |
| 赤 | Target ページ。同期済み Cookie が一件も見つからない |
| 青 | Source ページ。同期対象の Cookie を確認済み（監視中） |
| 青＋黄ドット | Source ページ。Cookie は読み取れているが、同一キーの Cookie が複数ドメインスコープに存在（Source 自体のログインに影響する可能性） |
| 紫 | Source ページ。同期対象のキーが見つからない（未ログインや設定ミスの可能性） |
| 灰 | どのルールにも該当しないページ |

### ポップアップのステータスタブ

アイコンをクリックすると **ステータスタブ** が開き、現在のページの状態と対処ガイドが表示される。

**緑＋黄ドット・青＋黄ドット（重複 Cookie 検出）** の場合は、競合している Cookie の一覧と個別の削除ボタンが表示される。手動でトラブルシュートしたいときに使用する。

### 同期の有効化・無効化

設定タブの各ルールに **「同期中」ボタン** がある。クリックすると無効化され、**そのルールが Target に書き込んだ Cookie が自動的に削除される**。

これにより、ログイン状態 → 無効化（Cookie 削除・ログアウト状態を再現）→ 動作確認 → 有効化 → Source 再ログイン → 自動同期、というサイクルで動作確認ができる。

再度クリックすると有効化され、次に Source ページで Cookie が更新されたタイミングから同期が再開する。

---

## アーキテクチャ

### ファイル構成

```
cookie-sync-relay/
├── manifest.json   # 拡張機能の定義（権限・エントリポイント）
├── background.js   # Service Worker。Cookie 監視・同期・ステータス判定
├── popup.html      # ポップアップの HTML・CSS
└── popup.js        # ポップアップのロジック（設定 UI・ステータス表示）
```

### データモデル

設定は `chrome.storage.local` に `rules` キーで JSON 配列として保存される。

```jsonc
{
  "rules": [
    {
      "sourceDomain": ".staging.example.com",  // 同期元ドメイン（先頭の . はワイルドカード）
      "keys": ["_session", "token"],           // 空配列 = 全 Cookie を同期
      "targets": [
        { "domain": "localhost",  "url": "http://localhost:3000/" },
        { "domain": "dev.local",  "url": "http://dev.local:3000/" }
      ],
      "enabled": true   // false のとき同期をスキップ
    }
  ]
}
```

`enabled` は省略時 `true` として扱う。`targets` は複数持てて全件に同期される。

### 同期フロー

```
[Source ページで Cookie が変化]
        │
        ▼
chrome.cookies.onChanged (background.js)
        │
        ├─ changeInfo.removed === true → スキップ
        │
        ▼
syncCookie(cookie)
        │
        ├─ rule.enabled === false → スキップ
        ├─ cookie.domain が rule.sourceDomain に一致しない → スキップ
        ├─ rule.keys が設定されていて cookie.name が含まれない → スキップ
        │
        ▼
  rule.targets を全件ループ
        │
        ├─ cookie.domain が target.domain と一致（ループ防止） → スキップ
        │
        ▼
  chrome.cookies.set(params)
        │
        ▼
  Target ドメインを開いているタブのアイコンを更新
```

**ループ防止:** Target ドメインで Cookie が変化しても、そのドメインが Source と一致しない限りは `syncCookie` の `domainMatches` チェックで弾かれる。加えて `targetVariants` チェックで二重に防いでいる。

**`domainMatches(hostname, pattern)`:** `pattern` の先頭 `.` を除いた bare domain で `===` または `.endsWith()` を判定する。`.staging.example.com` は `staging.example.com` と `sub.staging.example.com` の両方にマッチする。

### ステータス判定ロジック

`getTabStatus(url)` は現在のタブ URL を受け取り `{ status, duplicates }` を返す。

**Target ページの判定（優先）**

全ルールの全 Target を走査し、`hostname` がいずれかの `target.domain` にマッチするものを収集。マッチした組み合わせごとに Cookie を2種類のクエリで取得し、フラグを立てる。

| クエリ | 用途 | 理由 |
|---|---|---|
| `getAll({ domain: target.domain })` | 有効性・期限チェック | `path` が `/` 以外の Cookie も漏れなく拾うため |
| `getAll({ url: target.url })` | 重複チェック | 実際にサーバーへ送信される Cookie を対象にするため |

| フラグ | 条件 |
|---|---|
| `hasValid` | expirationDate なし（セッション Cookie）または未来の日時 |
| `hasExpired` | expirationDate が現在時刻以前 |
| `hasMissing` | 対象 Cookie が 1 件も見つからない |
| `hasDuplicates` | 同一キーの Cookie が複数のドメインスコープに存在 |

フラグの組み合わせからステータスを決定する。

```
hasValid && !hasExpired && !hasMissing
  → hasDuplicates ? "green_deduped" : "green"

hasValid && (hasExpired || hasMissing)
  → "yellow"

!hasValid && hasExpired
  → "orange"

それ以外
  → "red"
```

**Source ページの判定（Target に非該当の場合）**

`rule.sourceDomain` にマッチするルールを検索し、`chrome.cookies.getAll({ url })` で Cookie を取得する（`domain` ではなく `url` ベースにすることで、親ドメインスコープの同名 Cookie も重複として検出できる）。

- 対象 Cookie が存在し、同一キーの重複なし → `"blue"`
- 対象 Cookie が存在し、同一キーの重複あり → `"blue_deduped"`
- 対象 Cookie が存在しない → `"purple"`（未ログインや設定ミスの可能性）

### アイコン生成

PNG ファイルは持たず、起動時に `Uint8ClampedArray` でピクセルデータを生成して `ImageData` として保持する。Service Worker 環境でも `ImageData` コンストラクタは利用可能（Chrome 116 以降）。

- **単色アイコン（`makeIcon`）:** 16×16 の塗りつぶし円
- **合成アイコン（`makeCompositeIcon`）:** メイン円（左上寄り）＋白縁付きアクセント小円（右下）で `green_deduped`・`blue_deduped` に使用

アイコンはタブごとに `chrome.action.setIcon({ imageData, tabId })` で設定され、`tabs.onActivated` / `tabs.onUpdated` / `storage.onChanged` / Cookie 同期完了のタイミングで更新される。

### popup ↔ background 通信

popup は `chrome.runtime.sendMessage` で background の `getTabStatus` を呼び出す。

```
popup.js                          background.js
   │                                    │
   │── { type: "getTabStatus", url } ──▶│
   │                                    │ getTabStatus(url)
   │◀── { status, duplicates } ─────────│
```

background が `getTabStatus` のロジックを持つことで、アイコン更新と popup 表示の判定が同一コードを参照する。

### 既知の制約

- **Cookie 送信順序のコントロール不可:** 同一キーが複数ドメインスコープに存在する場合、`Cookie` ヘッダーの並び順は Chrome が決定し、拡張機能からは変更できない。重複が問題になる場合はポップアップのステータスタブから手動削除する。
- **`foo.example.com` への `example.com` Cookie 送信の抑止不可:** Cookie の送信先はブラウザが `domain` 属性のみで決定する。MV3 では `webRequest` のブロッキングモードが使えないため、送信を止める手段がない。
- **Target の bare domain 以外（親ドメインなど）の同名 Cookie:** `green_deduped` で警告するが自動削除はしない。意図的に残してあるもの（他ツールが設定した Cookie など）を誤って消さないための設計。
