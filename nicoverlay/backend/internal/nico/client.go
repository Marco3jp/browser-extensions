// Package nico はニコニコ動画の検索・コメント取得を行う。
// 検索以外は非公開APIに依存しているため、仕様変更時はこのパッケージだけを直す。
package nico

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const userAgent = "nicoverlay/0.1 (+personal use)"

type Client struct {
	HTTP *http.Client
	// UserSession は user_session Cookie の値。空ならゲストとして振る舞う。
	UserSession string
}

func NewClient(userSession string) *Client {
	return &Client{
		HTTP:        &http.Client{Timeout: 20 * time.Second},
		UserSession: userSession,
	}
}

func (c *Client) do(ctx context.Context, req *http.Request) ([]byte, error) {
	req = req.WithContext(ctx)
	req.Header.Set("User-Agent", userAgent)
	if c.UserSession != "" {
		req.AddCookie(&http.Cookie{Name: "user_session", Value: c.UserSession})
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return body, &HTTPError{Status: res.StatusCode, Body: truncate(string(body), 300)}
	}
	return body, nil
}

type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("http %d: %s", e.Status, e.Body)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
