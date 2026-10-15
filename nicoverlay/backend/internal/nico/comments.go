package nico

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"
)

// Comment / Thread は nvcomment v1 の形式そのまま。niconicomments の "v1" フォーマットとしてそのまま渡せる。
type Comment struct {
	ID          string    `json:"id"`
	No          int       `json:"no"`
	VposMs      int       `json:"vposMs"`
	Body        string    `json:"body"`
	Commands    []string  `json:"commands"`
	UserID      string    `json:"userId"`
	IsPremium   bool      `json:"isPremium"`
	Score       int       `json:"score"`
	PostedAt    time.Time `json:"postedAt"`
	NicoruCount int       `json:"nicoruCount"`
	NicoruID    *string   `json:"nicoruId"`
	Source      string    `json:"source"`
	IsMyPost    bool      `json:"isMyPost"`
}

type Thread struct {
	ID           string    `json:"id"`
	Fork         string    `json:"fork"`
	CommentCount int       `json:"commentCount"`
	Comments     []Comment `json:"comments"`
}

var ErrSessionRequired = errors.New("past log requires user_session")

// APIError は nvcomment が meta.errorCode を返したときのエラー。
// ゲストで過去ログを要求すると 400 INVALID_TOKEN になる。
type APIError struct {
	Status int
	Code   string
}

func (e *APIError) Error() string { return fmt.Sprintf("nvcomment %d %s", e.Status, e.Code) }

func (c *Client) threads(ctx context.Context, nv NvComment, additionals map[string]any) ([]Thread, error) {
	payload, err := json.Marshal(map[string]any{
		"params":      nv.Params,
		"threadKey":   nv.ThreadKey,
		"additionals": additionals,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, nv.Server+"/v1/threads", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Frontend-Id", "6")
	req.Header.Set("X-Frontend-Version", "0")

	body, err := c.do(ctx, req)
	var res struct {
		Meta struct {
			Status    int    `json:"status"`
			ErrorCode string `json:"errorCode"`
		} `json:"meta"`
		Data struct {
			Threads []Thread `json:"threads"`
		} `json:"data"`
	}
	if jerr := json.Unmarshal(body, &res); jerr != nil {
		if err != nil {
			return nil, fmt.Errorf("threads: %w", err)
		}
		return nil, fmt.Errorf("threads: decode: %w", jerr)
	}
	if res.Meta.ErrorCode != "" {
		return nil, &APIError{Status: res.Meta.Status, Code: res.Meta.ErrorCode}
	}
	if err != nil {
		return nil, fmt.Errorf("threads: %w", err)
	}
	return res.Data.Threads, nil
}

// Latest は各スレッドの最新コメントを取得する。ゲストでも可。
func (c *Client) Latest(ctx context.Context, w *WatchInfo) ([]Thread, error) {
	return c.threads(ctx, w.NvComment, map[string]any{})
}

type AllOptions struct {
	MaxPages int           // 0 なら 200
	Interval time.Duration // リクエスト間隔。0 なら 1 秒
	Progress func(page, total int)
}

// All は過去ログを遡って全コメントを取得する。user_session が必要。
// 1 リクエストで全スレッド分が返るので、新規コメントが出たスレッドのうち
// 最古の投稿時刻が最も新しいものに合わせて when を下げ、取りこぼしを防ぐ。
func (c *Client) All(ctx context.Context, w *WatchInfo, opt AllOptions) ([]Thread, error) {
	if c.UserSession == "" {
		return nil, ErrSessionRequired
	}
	if opt.MaxPages <= 0 {
		opt.MaxPages = 200
	}
	if opt.Interval <= 0 {
		opt.Interval = time.Second
	}

	type acc struct {
		thread Thread
		seen   map[int]bool
	}
	merged := map[string]*acc{} // key: id/fork
	var order []string
	total := 0
	when := time.Now().Unix()

	for page := 1; page <= opt.MaxPages; page++ {
		if page > 1 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(opt.Interval):
			}
		}
		ts, err := c.threads(ctx, w.NvComment, map[string]any{"res_from": -1000, "when": when})
		if err != nil {
			return nil, err
		}

		var next int64
		for _, t := range ts {
			key := t.ID + "/" + t.Fork
			a, ok := merged[key]
			if !ok {
				a = &acc{thread: Thread{ID: t.ID, Fork: t.Fork, CommentCount: t.CommentCount}, seen: map[int]bool{}}
				merged[key] = a
				order = append(order, key)
			}
			added := false
			var oldest int64
			for _, cm := range t.Comments {
				if a.seen[cm.No] {
					continue
				}
				a.seen[cm.No] = true
				a.thread.Comments = append(a.thread.Comments, cm)
				added = true
				total++
				if u := cm.PostedAt.Unix(); oldest == 0 || u < oldest {
					oldest = u
				}
			}
			// 同一秒のコメントを取りこぼさないよう +1 して重複は seen で弾く
			if added && oldest+1 > next {
				next = oldest + 1
			}
		}
		if opt.Progress != nil {
			opt.Progress(page, total)
		}
		if next == 0 || next >= when {
			break
		}
		when = next
	}

	out := make([]Thread, 0, len(order))
	for _, key := range order {
		t := merged[key].thread
		sort.Slice(t.Comments, func(i, j int) bool { return t.Comments[i].No < t.Comments[j].No })
		out = append(out, t)
	}
	return out, nil
}

func CountComments(ts []Thread) int {
	n := 0
	for _, t := range ts {
		n += len(t.Comments)
	}
	return n
}
