// Package server は Chrome 拡張機能向けのローカル HTTP API。
//
//	GET /healthz
//	GET /api/search?q=<title>&limit=20
//	GET /api/videos/{id}/comments?mode=latest|all&refresh=1
//
// 過去ログ(mode=all)は X-Nico-Session ヘッダーで user_session を受け取る。
// ヘッダーの値はログ・キャッシュに残さない。
package server

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/cache"
	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/nico"
)

const (
	sessionHeader = "X-Nico-Session"
	latestTTL     = 6 * time.Hour
)

var contentIDRe = regexp.MustCompile(`^(sm|so|nm)[0-9]{1,12}$`)

type Server struct {
	nico  *nico.Client
	cache *cache.Store

	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func New(store *cache.Store) *Server {
	return &Server{
		nico:  nico.NewClient(""),
		cache: store,
		locks: map[string]*sync.Mutex{},
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "nicoverlay"})
	})
	mux.HandleFunc("GET /api/search", s.handleSearch)
	mux.HandleFunc("GET /api/videos/{id}/comments", s.handleComments)
	return logRequests(guardOrigin(mux))
}

func (s *Server) client(r *http.Request) *nico.Client {
	c := *s.nico
	c.UserSession = strings.TrimSpace(r.Header.Get(sessionHeader))
	return &c
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "q is required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	vs, err := s.nico.Search(r.Context(), q, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream", err.Error())
		return
	}
	if vs == nil {
		vs = []nico.Video{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"videos": vs})
}

func (s *Server) handleComments(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !contentIDRe.MatchString(id) {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid content id")
		return
	}
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "latest"
	}
	if mode != "latest" && mode != "all" {
		writeError(w, http.StatusBadRequest, "bad_request", "mode must be latest or all")
		return
	}
	refresh := r.URL.Query().Get("refresh") == "1"
	c := s.client(r)

	lock := s.lockFor(id)
	lock.Lock()
	defer lock.Unlock()

	if !refresh {
		if e := s.cached(id, mode); e != nil {
			writeJSON(w, http.StatusOK, e)
			return
		}
	}
	if mode == "all" && c.UserSession == "" {
		writeError(w, http.StatusUnauthorized, "session_required", "past log requires "+sessionHeader)
		return
	}

	info, err := c.Watch(r.Context(), id)
	if err != nil {
		if errors.Is(err, nico.ErrNoComment) {
			writeError(w, http.StatusNotFound, "no_comment", err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, "upstream", err.Error())
		return
	}
	var ts []nico.Thread
	if mode == "all" {
		ts, err = c.All(r.Context(), info, nico.AllOptions{})
	} else {
		ts, err = c.Latest(r.Context(), info)
	}
	if err != nil {
		var apiErr *nico.APIError
		if errors.As(err, &apiErr) && apiErr.Code == "INVALID_TOKEN" {
			writeError(w, http.StatusUnauthorized, "invalid_session", "session expired or not premium")
			return
		}
		writeError(w, http.StatusBadGateway, "upstream", err.Error())
		return
	}

	e := &cache.Entry{Video: info, Mode: mode, FetchedAt: time.Now(), Threads: ts}
	if err := s.cache.Put(id, e); err != nil {
		log.Printf("cache put %s: %v", id, err)
	}
	writeJSON(w, http.StatusOK, e)
}

// cached は使えるキャッシュを返す。latest 要求には all のキャッシュも流用する。
func (s *Server) cached(id, mode string) *cache.Entry {
	if e, err := s.cache.Get(id, "all"); err == nil && e != nil {
		return e
	}
	if mode == "latest" {
		if e, err := s.cache.Get(id, "latest"); err == nil && e != nil && time.Since(e.FetchedAt) < latestTTL {
			return e
		}
	}
	return nil
}

func (s *Server) lockFor(id string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, ok := s.locks[id]
	if !ok {
		l = &sync.Mutex{}
		s.locks[id] = l
	}
	return l
}

// guardOrigin は Web ページからのリクエストを拒否し、拡張機能(chrome-extension://)と
// Origin なし(curl など)だけを通す。ローカルの API を任意のサイトに踏み台にされないため。
func guardOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !strings.HasPrefix(origin, "chrome-extension://") {
				writeError(w, http.StatusForbidden, "forbidden_origin", "origin not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET")
				w.Header().Set("Access-Control-Allow-Headers", sessionHeader)
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.RequestURI(), rec.status, time.Since(start).Round(time.Millisecond))
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": code, "message": msg})
}
