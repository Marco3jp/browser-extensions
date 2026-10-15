package nico

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const snapshotEndpoint = "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search"

// Video はスナップショット検索APIの1件分。データは1日1回更新なので数値は最新とは限らない。
type Video struct {
	ContentID      string    `json:"contentId"`
	Title          string    `json:"title"`
	ViewCounter    int       `json:"viewCounter"`
	CommentCounter int       `json:"commentCounter"`
	LengthSeconds  int       `json:"lengthSeconds"`
	ChannelID      int       `json:"channelId,omitempty"`
	StartTime      time.Time `json:"startTime"`
}

// Search はタイトルで動画を検索し、コメント数の多い順に返す。
func (c *Client) Search(ctx context.Context, q string, limit int) ([]Video, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	v := url.Values{}
	v.Set("q", q)
	v.Set("targets", "title")
	v.Set("fields", "contentId,title,viewCounter,commentCounter,lengthSeconds,channelId,startTime")
	v.Set("_sort", "-commentCounter")
	v.Set("_limit", strconv.Itoa(limit))
	v.Set("_context", "nicoverlay")

	req, err := http.NewRequest(http.MethodGet, snapshotEndpoint+"?"+v.Encode(), nil)
	if err != nil {
		return nil, err
	}
	body, err := c.do(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}
	var res struct {
		Data []Video `json:"data"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("search: decode: %w", err)
	}
	return res.Data, nil
}
