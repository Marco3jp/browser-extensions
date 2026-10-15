package nico

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"regexp"
)

// NvComment は視聴ページに埋め込まれたコメントサーバへの接続情報。
type NvComment struct {
	Server    string          `json:"server"`
	ThreadKey string          `json:"threadKey"`
	Params    json.RawMessage `json:"params"`
}

type WatchInfo struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Duration  int       `json:"duration"`
	NvComment NvComment `json:"-"`
}

var serverResponseRe = regexp.MustCompile(`<meta name="server-response" content="([^"]*)"`)

var ErrNoComment = errors.New("watch page has no nvComment (video may be deleted or not accessible)")

// Watch は視聴ページを取得し、動画情報とコメント接続情報を取り出す。
// 有料のチャンネル動画でもプレビュー扱いで nvComment が返ることを確認済み。
func (c *Client) Watch(ctx context.Context, id string) (*WatchInfo, error) {
	req, err := http.NewRequest(http.MethodGet, "https://www.nicovideo.jp/watch/"+id, nil)
	if err != nil {
		return nil, err
	}
	body, err := c.do(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("watch %s: %w", id, err)
	}
	m := serverResponseRe.FindSubmatch(body)
	if m == nil {
		return nil, fmt.Errorf("watch %s: server-response meta not found", id)
	}
	var sr struct {
		Data struct {
			Response struct {
				Video struct {
					ID       string `json:"id"`
					Title    string `json:"title"`
					Duration int    `json:"duration"`
				} `json:"video"`
				Comment struct {
					NvComment *NvComment `json:"nvComment"`
				} `json:"comment"`
			} `json:"response"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(html.UnescapeString(string(m[1]))), &sr); err != nil {
		return nil, fmt.Errorf("watch %s: decode server-response: %w", id, err)
	}
	r := sr.Data.Response
	if r.Comment.NvComment == nil || r.Comment.NvComment.ThreadKey == "" {
		return nil, fmt.Errorf("watch %s: %w", id, ErrNoComment)
	}
	return &WatchInfo{
		ID:        r.Video.ID,
		Title:     r.Video.Title,
		Duration:  r.Video.Duration,
		NvComment: *r.Comment.NvComment,
	}, nil
}
