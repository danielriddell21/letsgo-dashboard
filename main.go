// Command letsgo-dashboard serves a dashboard of Go releases made with
// letsgo. It stores nothing; see README.md.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/danielriddell21/letsgo-dashboard/internal/server"
	"github.com/danielriddell21/letsgo-dashboard/internal/snapshot"
)

//go:embed all:web
var web embed.FS

var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "snapshot" {
		os.Exit(runSnapshot(os.Args[2:]))
	}

	addr := flag.String("addr", env("ADDR", ":8080"), "address to listen on")
	health := flag.Bool("healthcheck", false, "check that a server on -addr is answering, and exit")
	flag.Parse()
	if *health {
		os.Exit(healthcheck(*addr))
	}

	cfg := server.Config{
		API:          os.Getenv("GITHUB_API_URL"),
		Web:          os.Getenv("GITHUB_SERVER_URL"),
		ClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		ClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		PublicToken:  os.Getenv("DASHBOARD_PUBLIC_TOKEN"),
		Defaults:     list(os.Getenv("DASHBOARD_REPOS")),
		AssetHosts:   list(os.Getenv("DASHBOARD_ASSET_HOSTS")),
		Version:      version,
	}
	static, err := fsSub()
	if err != nil {
		log.Fatal(err)
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           server.New(cfg, static),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	signIn := "off (viewers paste a token)"
	if cfg.ClientID != "" && cfg.ClientSecret != "" {
		signIn = "on"
	}
	fmt.Printf("letsgo-dashboard %s listening on %s, GitHub sign-in %s\n", version, *addr, signIn)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// runSnapshot writes the dashboard as a static site for public
// repositories, for GitHub Pages: letsgo-dashboard snapshot [-o dir] owner/name...
func runSnapshot(args []string) int {
	fs := flag.NewFlagSet("snapshot", flag.ExitOnError)
	out := fs.String("o", "site", "directory to write the site to")
	_ = fs.Parse(args)
	static, err := fsSub()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	projects := fs.Args()
	if len(projects) == 0 {
		projects = list(os.Getenv("DASHBOARD_REPOS"))
	}
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		token = os.Getenv("GH_TOKEN")
	}
	err = snapshot.Write(context.Background(), snapshot.Options{
		API: os.Getenv("GITHUB_API_URL"), Token: token, Projects: projects, Out: *out, Web: static,
		Version: version, Generated: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	fmt.Printf("wrote %s: %s\n", *out, strings.Join(projects, ", "))
	return 0
}

func fsSub() (fs.FS, error) {
	static, err := fs.Sub(web, "web")
	if err != nil {
		return nil, fmt.Errorf("web: %w", err)
	}
	return static, nil
}

// healthcheck asks a running server whether it is up. The image has no shell
// or curl, so the binary checks itself.
func healthcheck(addr string) int {
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+host+"/healthz", nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// list splits a comma- or space-separated setting.
func list(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' })
}
