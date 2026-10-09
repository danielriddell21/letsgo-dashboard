// Package server serves the dashboard and the few GitHub calls it can't make
// from a browser. It stores nothing: no database, no sessions, no logs of
// tokens. Everything a viewer sets up lives in their own browser.
package server

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
	"time"
)

// Config is how one deployment is set up. Every field is optional.
type Config struct {
	// API is the GitHub REST API base URL. Empty means https://api.github.com.
	API string

	// Web is GitHub's web base URL, for sign-in. Empty means https://github.com.
	Web string

	// ClientID and ClientSecret are a GitHub App's, to offer "Sign in with
	// GitHub". Without them, viewers paste a token.
	ClientID, ClientSecret string

	// PublicToken is used for viewers who haven't signed in. Give it access
	// only to what everyone who can reach this server may see.
	PublicToken string

	// Defaults are projects shown to a viewer who hasn't chosen any, as
	// owner/name or owner/name@prefix/. Empty means none: the viewer picks.
	Defaults []string

	// AssetHosts are the hosts a release asset download may be redirected
	// to. Empty means GitHub's own.
	AssetHosts []string

	// Version is shown in the page footer.
	Version string
}

func (c Config) api() string {
	if c.API == "" {
		return "https://api.github.com"
	}
	return strings.TrimRight(c.API, "/")
}

func (c Config) web() string {
	if c.Web == "" {
		return "https://github.com"
	}
	return strings.TrimRight(c.Web, "/")
}

func (c Config) assetHosts() []string {
	if len(c.AssetHosts) == 0 {
		return []string{".githubusercontent.com", ".github.com"}
	}
	return c.AssetHosts
}

// New returns the server's handler. static holds the web app.
func New(cfg Config, static fs.FS) http.Handler {
	client := &http.Client{
		Timeout: 30 * time.Second,
		// Redirects are followed by hand, so each hop can be checked.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	mux := http.NewServeMux()
	mux.Handle("GET /api/gh/", &proxy{cfg: cfg, client: client})
	mux.HandleFunc("GET /api/config", cfg.serveConfig)
	mux.Handle("POST /api/oauth/token", &exchange{cfg: cfg, client: client})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok\n")) })
	mux.Handle("GET /", http.FileServerFS(static))
	return secure(mux)
}

// serveConfig tells the page what this deployment offers. It carries no
// secret: the client ID of a GitHub App is public by design.
func (c Config) serveConfig(w http.ResponseWriter, _ *http.Request) {
	out := struct {
		OAuth    bool     `json:"oauth"`
		ClientID string   `json:"client_id,omitempty"`
		Web      string   `json:"web"`
		Defaults []string `json:"defaults"`
		Public   bool     `json:"public_token"`
		Version  string   `json:"version"`
	}{
		OAuth:    c.ClientID != "" && c.ClientSecret != "",
		Web:      c.web(),
		Defaults: c.Defaults,
		Public:   c.PublicToken != "",
		Version:  c.Version,
	}
	if out.OAuth {
		out.ClientID = c.ClientID
	}
	if out.Defaults == nil {
		out.Defaults = []string{}
	}
	writeJSON(w, http.StatusOK, out)
}

// secure sets the headers every response carries. The page may talk only to
// this server, so a token never leaves for anywhere else.
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; "+
			"connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}
