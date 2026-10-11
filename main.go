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
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/danielriddell21/letsgo-dashboard/internal/config"
	"github.com/danielriddell21/letsgo-dashboard/internal/server"
	"github.com/danielriddell21/letsgo-dashboard/internal/snapshot"
)

//go:embed all:web
var web embed.FS

var version = "dev"

// shutdownGrace is how long requests in flight get to finish on SIGTERM.
const shutdownGrace = 10 * time.Second

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run serves the dashboard, or with "snapshot" first, writes it as a site.
// SIGINT or SIGTERM stops either one.
func run(args []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := config.Load(os.Getenv)
	cfg.Server.Version = version
	if len(args) > 0 && args[0] == "snapshot" {
		return runSnapshot(ctx, cfg, args[1:])
	}
	return runServer(ctx, cfg, args)
}

// runServer serves the dashboard until ctx is cancelled:
// letsgo-dashboard [-addr host:port] [-healthcheck].
func runServer(ctx context.Context, cfg config.Config, args []string) error {
	flags := flag.NewFlagSet("letsgo-dashboard", flag.ExitOnError)
	addr := flags.String("addr", cfg.Addr, "address to listen on")
	health := flags.Bool("healthcheck", false, "check that a server on -addr is answering, and exit")
	_ = flags.Parse(args)
	if *health {
		return healthcheck(ctx, *addr)
	}

	static, err := webFS()
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              *addr,
		Handler:           server.New(cfg.Server, static),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
	}

	signIn := "off (viewers paste a token)"
	if cfg.Server.OAuth() {
		signIn = "on"
	}
	fmt.Printf("letsgo-dashboard %s listening on %s, GitHub sign-in %s\n", version, *addr, signIn)

	served := make(chan error, 1)
	go func() { served <- srv.ListenAndServe() }()
	select {
	case err := <-served:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	// A fresh context: the one given here is already cancelled.
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownGrace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-served; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}
	return nil
}

// runSnapshot writes the dashboard as a static site for public
// repositories, for GitHub Pages: letsgo-dashboard snapshot [-o dir] owner/name...
func runSnapshot(ctx context.Context, cfg config.Config, args []string) error {
	flags := flag.NewFlagSet("snapshot", flag.ExitOnError)
	out := flags.String("o", "site", "directory to write the site to")
	_ = flags.Parse(args)

	static, err := webFS()
	if err != nil {
		return err
	}
	projects := flags.Args()
	if len(projects) == 0 {
		projects = cfg.Server.Defaults
	}
	err = snapshot.Write(ctx, snapshot.Options{
		API: cfg.Server.API, Token: cfg.Token, Projects: projects, Out: *out, Web: static,
		Version: version, Generated: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return err
	}
	fmt.Printf("wrote %s: %s\n", *out, strings.Join(projects, ", "))
	return nil
}

// webFS is the page, from web/ in the binary.
func webFS() (fs.FS, error) {
	static, err := fs.Sub(web, "web")
	if err != nil {
		return nil, fmt.Errorf("web: %w", err)
	}
	return static, nil
}

// healthcheck asks whether a server is accepting connections on addr. The
// image has no shell or curl, so the binary checks itself.
func healthcheck(ctx context.Context, addr string) error {
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "tcp", host)
	if err != nil {
		return fmt.Errorf("healthcheck: %w", err)
	}
	_ = conn.Close()
	return nil
}
