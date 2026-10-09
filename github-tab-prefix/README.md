# GitHub Tab Prefix

GitHub のタブタイトルの先頭にリポジトリ名を付ける Chrome 拡張。

GitHub の元のタイトルは `src/foo.ts at main · acme/web` のようにリポジトリ名が末尾にあり、
タブを狭めると消えてどのリポジトリを開いているか分からなくなるので、先頭に持ってくる。
オーナー名は付けない（狭いタブ幅を食うだけで、どのリポジトリかは分かるため）。

```
web: src/foo.ts at main · acme/web
```

## リポジトリ名の短縮

設定画面に登録した接頭辞で始まるリポジトリは、その部分を落とす。
同じ接頭辞のリポジトリが多く、頭が揃っていると見分けが付かないため。

`chrome://extensions` でこの拡張の「詳細」→「拡張機能のオプション」を開き、1行に1つ書いて保存する。
`acme-service-` と `acme-web-` を登録したときはこうなる。

| リポジトリ | タブに出る名前 |
|---|---|
| `acme-service-billing` | `billing` |
| `acme-web-api-gateway` | `api-gateway` |
| `acme-web-frontend` | `frontend` |
| `web` | `web` |

設定は `chrome.storage.sync` に入るので、同じアカウントでログインしている Chrome 間で共有される。

## conventional commit のスコープ

PR タイトルが `feat(invoice): ...` の形のときは、スコープをリポジトリ名の横に持ち上げて、
元の `feat(invoice): ` は消す。

```
元: feat(invoice): 請求書を再発行できるようにする by Marco3jp · Pull Request #123 · acme/acme-service-billing
後: billing(invoice): 請求書を再発行できるようにする by Marco3jp · Pull Request #123 · acme/acme-service-billing
```

`feat` などの type は落ちる。スコープの無い `fix: ...` は持ち上げるものが無いので、元のタイトルをそのまま残す。

```
frontend: fix: ボタンが押せない by Marco3jp · Pull Request #9 · acme/acme-web-frontend
```

type として扱う語は `content.js` の `CONVENTIONAL_TYPES` にある。
ここを `[a-z]+` のような雑な形にすると `WIP: ...` まで巻き込んで消してしまうので、列挙で持っている。

## 入れ方

ビルドは不要。

1. `chrome://extensions` を開く
2. 右上のデベロッパーモードを ON
3. 「パッケージ化されていない拡張機能を読み込む」でこのディレクトリを指定

## 仕組み

タブに表示される文字列はそのページの `document.title` そのままで、
拡張から直接タイトルを差し替える API は無い（`chrome.tabs.update` は title を受け取らない）。
なので content script でページ側の `document.title` を書き換えている。

GitHub は Turbo で SPA 遷移するため、遷移ごとに `<title>` が書き戻される。
`<head>` を MutationObserver で見張って、書き戻されたら都度かぶせ直す。

`apply()` は何回通しても同じ結果になるようにしてある（すでに付いている `billing(invoice): ` を
いったん剥がしてから組み立て直す。剥がしたスコープは覚えておいて、元タイトル側にスコープが無ければそれを使う）。
自分の書き換えが MutationObserver を再発火させて無限ループするのを、これで防いでいる。
`applying` のようなフラグでは防げない（MutationObserver のコールバックはマイクロタスクで後から呼ばれるため、
コールバックが動く時点でフラグは false に戻っている）。

## 制約

- `document.title` を書き換えるので、ブックマーク時の初期名や履歴のエントリ名にもリポジトリ名が入る
- `/settings` や `/notifications` など、リポジトリではないパスは `RESERVED` で除外している。抜けがあれば追加する
