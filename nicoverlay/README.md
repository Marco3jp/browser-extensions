# nicoverlay

dアニメストアの再生画面に、ニコニコ動画（無料配信時の動画など）のコメントを重ねて表示する Chrome 拡張。
コメントの検索・取得はローカルで動かすバックエンド（Go）が行う。

- ルート … 拡張本体（`npm run build` で `dist/` に出力）
- [`backend/`](backend/) … バックエンド / CLI（WSL などで動かす）

コメントは自分で観るためだけに使い、再配布しないこと。ニコニコの非公開 API に依存しているため、仕様変更で動かなくなることがある（直すのは `backend/internal/nico/watch.go` と `comments.go`）。

## 使い方

1. バックエンドを起動する（下記）
2. 拡張の設定でサーバーアドレス（既定 `http://localhost:8787`）を確認し、「接続テスト」
3. dアニメの再生画面右上の「ニコ」ボタンでパネルを開く
4. 作品名と話数で検索し、使う動画を選ぶ。同じ話が複数のチャンネルで配信されていることがあるので、コメント数などを見て選ぶ。選択とオフセットは話ごとに保存され、次回から自動で読み込む
5. オフセットでタイミングを合わせる。尺が違う場合は「尺差を補正」で初期値を入れられる

- コメントの表示/非表示、再取得はパネルから
- NG（ワード・`/正規表現/`・ユーザー ID・かんたんコメント非表示）はパネルか設定画面で編集する。ニコニコ側の NG 設定とは別
- 過去ログ（プレミアム会員）は設定画面で有効にする。ブラウザの `user_session` Cookie を読み取り、サーバーがローカル（localhost / 127.0.0.1）の場合だけ送信する。無効のときはゲストで取れる最新分（1 話あたり数千件程度）だけを使う

## バックエンド

```sh
cd backend
go build -o nicoverlay ./cmd/nicoverlay
./nicoverlay serve                 # http://127.0.0.1:8787
```

| エンドポイント | 内容 |
|---|---|
| `GET /healthz` | 疎通確認 |
| `GET /api/search?q=<タイトル>&limit=20` | スナップショット検索 API でコメント数順に検索 |
| `GET /api/videos/{id}/comments?mode=latest\|all&refresh=1` | nvcomment v1 形式のスレッド配列を返す |

- `mode=latest` はゲストで取得できる最新分。有料化済みのチャンネル動画でも取得できる。
- `mode=all` は過去ログを遡って全件取得する。`X-Nico-Session` ヘッダーに `user_session` の値が必要。
- キャッシュは `~/.cache/nicoverlay/`。latest は 6 時間、all は `refresh=1` まで再利用する。認証情報は保存しない。
- `Origin` が `chrome-extension://` 以外のブラウザからのリクエストは 403 で拒否する。

CLI でも使える:

```sh
./nicoverlay search ひみつのアイプリ 29
./nicoverlay comments so44220343
NICO_USER_SESSION=... ./nicoverlay comments -all so44220343
```

### WSL2 で届かない場合

Windows の Chrome から `http://localhost:8787/healthz` が開けないときは、`%UserProfile%\.wslconfig` に以下を追加して `wsl --shutdown` する。

```ini
[wsl2]
networkingMode=mirrored
```

## 入れ方

ビルドが要る。`npm ci && npm run build` のあと `dist/` を読み込む（`npm run dev` で監視ビルド）。
