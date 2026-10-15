// nicoverlay: ニコニコ動画のコメントを取得するCLI。
//
//	nicoverlay search <タイトル>
//	nicoverlay comments [-all] [-o file] <contentId>
//	nicoverlay serve [-addr 127.0.0.1:8787] [-cache dir]
//
// 過去ログ(-all)には環境変数 NICO_USER_SESSION に user_session Cookie の値が必要。
// serve では拡張機能が X-Nico-Session ヘッダーで渡す。
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/cache"
	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/nico"
	"github.com/Marco3jp/browser-extensions/nicoverlay/backend/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	client := nico.NewClient(os.Getenv("NICO_USER_SESSION"))
	var err error
	switch os.Args[1] {
	case "search":
		err = runSearch(ctx, client, os.Args[2:])
	case "comments":
		err = runComments(ctx, client, os.Args[2:])
	case "serve":
		err = runServe(ctx, os.Args[2:])
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  nicoverlay search [-n 20] <title>
  nicoverlay comments [-all] [-o file] <contentId>
  nicoverlay serve [-addr 127.0.0.1:8787] [-cache dir]`)
	os.Exit(2)
}

func runSearch(ctx context.Context, c *nico.Client, args []string) error {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	n := fs.Int("n", 20, "max results")
	fs.Parse(args)
	if fs.NArg() == 0 {
		usage()
	}
	vs, err := c.Search(ctx, strings.Join(fs.Args(), " "), *n)
	if err != nil {
		return err
	}
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tCOMMENTS\tVIEWS\tLENGTH\tCHANNEL\tSTART\tTITLE")
	for _, v := range vs {
		fmt.Fprintf(tw, "%s\t%d\t%d\t%d:%02d\t%d\t%s\t%s\n",
			v.ContentID, v.CommentCounter, v.ViewCounter, v.LengthSeconds/60, v.LengthSeconds%60,
			v.ChannelID, v.StartTime.Format("2006-01-02"), v.Title)
	}
	return tw.Flush()
}

func runComments(ctx context.Context, c *nico.Client, args []string) error {
	fs := flag.NewFlagSet("comments", flag.ExitOnError)
	all := fs.Bool("all", false, "fetch past logs (requires NICO_USER_SESSION)")
	out := fs.String("o", "", "output file (default: <id>.comments.json)")
	fs.Parse(args)
	if fs.NArg() != 1 {
		usage()
	}
	id := fs.Arg(0)

	w, err := c.Watch(ctx, id)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "%s %s (%d:%02d)\n", w.ID, w.Title, w.Duration/60, w.Duration%60)

	var ts []nico.Thread
	if *all {
		ts, err = c.All(ctx, w, nico.AllOptions{Progress: func(page, total int) {
			fmt.Fprintf(os.Stderr, "\rpage %d: %d comments", page, total)
		}})
		if err == nil {
			fmt.Fprintln(os.Stderr)
		}
	} else {
		ts, err = c.Latest(ctx, w)
	}
	if err != nil {
		return err
	}
	for _, t := range ts {
		fmt.Fprintf(os.Stderr, "  thread %s/%s: %d / %d\n", t.ID, t.Fork, len(t.Comments), t.CommentCount)
	}

	if *out == "" {
		*out = id + ".comments.json"
	}
	f, err := os.Create(*out)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := json.NewEncoder(f).Encode(ts); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "wrote %d comments to %s\n", nico.CountComments(ts), *out)
	return nil
}

func runServe(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:8787", "listen address")
	dir := fs.String("cache", cache.DefaultDir(), "cache directory")
	fs.Parse(args)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           server.New(&cache.Store{Dir: *dir}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		srv.Close()
	}()
	log.Printf("listening on http://%s (cache: %s)", *addr, *dir)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}
