# browser-extensions

手元で使っている Chrome 拡張をまとめたリポジトリ。ディレクトリごとに独立した拡張になっている。

| ディレクトリ | 内容 | ビルド |
|---|---|---|
| [cookie-sync-relay](cookie-sync-relay/) | Staging などのセッション Cookie を localhost へ自動で同期する | 不要 |
| [github-tab-prefix](github-tab-prefix/) | GitHub のタブタイトルの先頭にリポジトリ名を付ける | 不要 |
| [gpt-ad-placeholder](gpt-ad-placeholder/) | GPT の広告枠を、広告が出るまで色付きのモックで見えるようにする | 不要 |
| [highlight-crawlable-anchors](highlight-crawlable-anchors/) | ページ内のリンクをクロールされるかどうかで色分けする | 要 |
| [study-sence-deduce](study-sence-deduce/) | dev / stg / prod の環境リボン、環境の切り替え、URL のテンプレ保存 | 要 |
| [tab-sweeper](tab-sweeper/) | 重複したタブや、URL・タイトルで絞り込んだタブをまとめて閉じる | 不要 |

## 入れ方

[Releases の latest](https://github.com/Marco3jp/browser-extensions/releases/tag/latest) から zip を落として展開し、`chrome://extensions` のデベロッパーモードで「パッケージ化されていない拡張機能を読み込む」に展開したディレクトリを指定する。

手元でビルドする場合、ビルド不要のものはディレクトリをそのまま、ビルドが要るものは `npm ci && npm run build` のあとに `dist/` を指定する。

## 追加するとき

ルートにディレクトリを1つ足し、ビルドが要るなら `package.json` に `build` スクリプトを置いて `dist/` に出力する。`.github/workflows/release.yml` の対象は `manifest.json` の有無で自動で拾う。
