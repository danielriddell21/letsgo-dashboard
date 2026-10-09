package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
)

// upstream is a fake GitHub: it records what reached it and answers a few
// routes, including an asset that redirects to a separate "asset host".
type upstream struct {
	api, assets *httptest.Server
	seen        []*http.Request
	exchanged   url.Values
}

func newUpstream(t *testing.T) *upstream {
	t.Helper()
	u := &upstream{}
	u.assets = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u.seen = append(u.seen, r)
		_, _ = w.Write([]byte(`{"schema":1}`))
	}))
	u.api = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u.seen = append(u.seen, r)
		switch r.URL.Path {
		case "/repos/o/r/releases/assets/7":
			http.Redirect(w, r, u.assets.URL+"/signed/7?sig=abc", http.StatusFound)
		case "/repos/o/r/releases/assets/8":
			http.Redirect(w, r, "http://evil.test/8", http.StatusFound)
		case "/login/oauth/access_token":
			_ = r.ParseForm()
			u.exchanged = r.PostForm
			_, _ = w.Write([]byte(`{"access_token":"gho_user"}`))
		default:
			w.Header().Set("X-RateLimit-Remaining", "59")
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		}
	}))
	t.Cleanup(u.api.Close)
	t.Cleanup(u.assets.Close)
	return u
}

func (u *upstream) server(cfg Config) *httptest.Server {
	cfg.API, cfg.Web = u.api.URL, u.api.URL
	if cfg.AssetHosts == nil {
		cfg.AssetHosts = []string{"127.0.0.1"}
	}
	static := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>dashboard")}}
	return httptest.NewServer(New(cfg, static))
}

func get(t *testing.T, srv *httptest.Server, path, token string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, srv.URL+path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func TestProxyRelaysAllowedReadsWithTheViewersToken(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{PublicToken: "public"})
	defer srv.Close()

	resp := get(t, srv, "/api/gh/repos/o/r/releases?per_page=100&page=2&secret=x", "viewer")
	if resp.StatusCode != http.StatusOK || resp.Header.Get("X-RateLimit-Remaining") != "59" {
		t.Fatalf("status %d, rate header %q", resp.StatusCode, resp.Header.Get("X-RateLimit-Remaining"))
	}
	last := u.seen[len(u.seen)-1]
	if got := last.Header.Get("Authorization"); got != "Bearer viewer" {
		t.Errorf("Authorization upstream = %q", got)
	}
	if last.URL.RawQuery != "page=2&per_page=100" {
		t.Errorf("query upstream = %q; unknown parameters must be dropped", last.URL.RawQuery)
	}
}

func TestProxyUsesThePublicTokenForAnonymousViewers(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{PublicToken: "public"})
	defer srv.Close()
	get(t, srv, "/api/gh/repos/o/r", "")
	if got := u.seen[len(u.seen)-1].Header.Get("Authorization"); got != "Bearer public" {
		t.Errorf("Authorization upstream = %q", got)
	}
}

func TestProxyRelaysRepositorySearchWithOnlyItsOwnParameters(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()

	resp := get(t, srv, "/api/gh/search/repositories?q=letsgo+user%3Adanielriddell21&per_page=10&sort=stars&secret=x", "viewer")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	last := u.seen[len(u.seen)-1]
	if last.URL.Path != "/search/repositories" {
		t.Errorf("path upstream = %q", last.URL.Path)
	}
	if got := last.URL.Query(); got.Get("q") != "letsgo user:danielriddell21" || got.Get("per_page") != "10" || got.Get("secret") != "" {
		t.Errorf("query upstream = %v", got)
	}
}

func TestProxyRefusesEverythingElse(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()
	for _, path := range []string{
		"/api/gh/repos/o/r/contents/secret.txt",
		"/api/gh/repos/o/r/releases/assets/x",
		"/api/gh/repos/o/../r",
		"/api/gh/user/emails",
		"/api/gh/graphql",
	} {
		if resp := get(t, srv, path, "t"); resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusNotFound {
			t.Errorf("%s: status %d, want refused", path, resp.StatusCode)
		}
	}
	resp, err := http.Post(srv.URL+"/api/gh/repos/o/r/releases", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST: status %d, want 405", resp.StatusCode)
	}
	if len(u.seen) != 0 {
		t.Errorf("%d refused requests reached GitHub", len(u.seen))
	}
}

func TestProxyFollowsAnAssetRedirectWithoutTheToken(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()
	resp := get(t, srv, "/api/gh/repos/o/r/releases/assets/7", "viewer")
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK || string(body) != `{"schema":1}` {
		t.Fatalf("status %d, body %q", resp.StatusCode, body)
	}
	last := u.seen[len(u.seen)-1]
	if last.URL.Path != "/signed/7" || last.Header.Get("Authorization") != "" {
		t.Errorf("asset host got %s with Authorization %q", last.URL.Path, last.Header.Get("Authorization"))
	}
}

func TestProxyRefusesARedirectToAnotherHost(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()
	if resp := get(t, srv, "/api/gh/repos/o/r/releases/assets/8", "viewer"); resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status %d, want 502", resp.StatusCode)
	}
}

func TestConfigCarriesNoSecret(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{ClientID: "Iv1.abc", ClientSecret: "s3cret", PublicToken: "public", Defaults: []string{"o/r"}})
	defer srv.Close()
	resp := get(t, srv, "/api/config", "")
	body, _ := io.ReadAll(resp.Body)
	if strings.Contains(string(body), "s3cret") || strings.Contains(string(body), `"public"`) {
		t.Fatalf("config leaks a secret: %s", body)
	}
	var cfg struct {
		OAuth    bool     `json:"oauth"`
		ClientID string   `json:"client_id"`
		Defaults []string `json:"defaults"`
	}
	if err := json.Unmarshal(body, &cfg); err != nil || !cfg.OAuth || cfg.ClientID != "Iv1.abc" || len(cfg.Defaults) != 1 {
		t.Errorf("config = %s (%v)", body, err)
	}
}

func TestExchangeTradesACodeFromThisPageOnly(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{ClientID: "Iv1.abc", ClientSecret: "s3cret"})
	defer srv.Close()

	post := func(origin string) *http.Response {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/oauth/token", strings.NewReader(`{"code":"c","code_verifier":"v","redirect_uri":"`+srv.URL+`/"}`))
		req.Header.Set("Content-Type", "application/json")
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = resp.Body.Close() })
		return resp
	}

	if resp := post("https://elsewhere.test"); resp.StatusCode != http.StatusForbidden {
		t.Errorf("cross-origin exchange: status %d", resp.StatusCode)
	}
	resp := post(srv.URL)
	var out map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out["access_token"] != "gho_user" {
		t.Fatalf("exchange = %d %v", resp.StatusCode, out)
	}
	if u.exchanged.Get("client_secret") != "s3cret" || u.exchanged.Get("code_verifier") != "v" {
		t.Errorf("GitHub got %v", u.exchanged)
	}
}

func TestExchangeIsOffWithoutAnApp(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()
	resp, err := http.Post(srv.URL+"/api/oauth/token", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status %d, want 404", resp.StatusCode)
	}
}

func TestPagesCarrySecurityHeaders(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()
	resp := get(t, srv, "/", "")
	if csp := resp.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "connect-src 'self'") || !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Errorf("CSP = %q", csp)
	}
}

func TestProxyLetsTheBrowserKeepAReleaseFileOnlyForTheSameToken(t *testing.T) {
	u := newUpstream(t)
	srv := u.server(Config{})
	defer srv.Close()

	file := get(t, srv, "/api/gh/repos/o/r/releases/assets/7", "viewer")
	if cc := file.Header.Get("Cache-Control"); !strings.Contains(cc, "private") || strings.Contains(cc, "no-store") {
		t.Errorf("a release file's Cache-Control = %q", cc)
	}
	if file.Header.Get("Vary") != "Authorization" {
		t.Errorf("Vary = %q; a cached private file must not be served to a request with another token", file.Header.Get("Vary"))
	}
	if cc := get(t, srv, "/api/gh/repos/o/r/releases", "viewer").Header.Get("Cache-Control"); cc != "no-store" {
		t.Errorf("a release list's Cache-Control = %q, want no-store", cc)
	}
}
