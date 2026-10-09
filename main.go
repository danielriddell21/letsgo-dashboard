// Command letsgo-dashboard serves a dashboard of Go releases made with
// letsgo. It stores nothing; see README.md.
package main

import (
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
)

//go:embed all:web
var web embed.FS

var version = "dev"

func main() {
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
	static, err := fs.Sub(web, "web")
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

// healthcheck asks a running server whether it is up. The image has no shell
// or curl, so the binary checks itself.
func healthcheck(addr string) int {
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + host + "/healthz")
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
