// Package cache は取得済みコメントを contentId 単位でファイルに保存する。
// user_session などの認証情報は保存しない。
package cache

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/nico"
)

type Entry struct {
	Video     *nico.WatchInfo `json:"video"`
	Mode      string          `json:"mode"` // "latest" | "all"
	FetchedAt time.Time       `json:"fetchedAt"`
	Threads   []nico.Thread   `json:"threads"`
}

type Store struct {
	Dir string
}

func DefaultDir() string {
	if d, err := os.UserCacheDir(); err == nil {
		return filepath.Join(d, "nicoverlay")
	}
	return filepath.Join(os.TempDir(), "nicoverlay")
}

// id は呼び出し側で検証済みであること(パス区切りを含まない)。
func (s *Store) path(id, mode string) string {
	return filepath.Join(s.Dir, id+"."+mode+".json")
}

// Get はキャッシュを返す。無い場合は (nil, nil)。
func (s *Store) Get(id, mode string) (*Entry, error) {
	b, err := os.ReadFile(s.path(id, mode))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var e Entry
	if err := json.Unmarshal(b, &e); err != nil {
		return nil, nil // 壊れたキャッシュは無視して取り直す
	}
	return &e, nil
}

func (s *Store) Put(id string, e *Entry) error {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.Dir, id+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := json.NewEncoder(tmp).Encode(e); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path(id, e.Mode))
}
