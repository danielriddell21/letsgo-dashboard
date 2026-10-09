package snapshot

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"
)

func fakeGitHub(t *testing.T, private bool) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/o/r":
			_ = json.NewEncoder(w).Encode(map[string]any{"private": private, "description": "a tool", "html_url": "https://github.com/o/r", "owner": map[string]string{"avatar_url": "https://avatars.example/o"}})
		case "/repos/o/r/releases":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"tag_name": "v1.0.0", "html_url": "https://github.com/o/r/releases/tag/v1.0.0", "published_at": "2026-10-01T00:00:00Z", "body": "notes",
					"assets": []map[string]any{{"id": 1, "name": "letsgo.json"}, {"id": 2, "name": "audit.json"}, {"id": 3, "name": "r_linux_amd64.tar.gz"}},
				},
				{"tag_name": "v1.1.0", "draft": true, "assets": []map[string]any{{"id": 9, "name": "letsgo.json"}}},
			})
		case "/repos/o/r/releases/assets/1":
			_, _ = w.Write([]byte(`{"schema":1}` + "\n"))
		case "/repos/o/r/releases/assets/2":
			_, _ = w.Write([]byte(`{"schema":1,"audits":[]}`))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestWriteBuildsAStaticSite(t *testing.T) {
	srv := fakeGitHub(t, false)
	out := t.TempDir()
	web := fstest.MapFS{"index.html": {Data: []byte("page")}, "js/core.test.mjs": {Data: []byte("test")}}
	err := Write(context.Background(), Options{API: srv.URL, Projects: []string{"o/r", "o/r@cli/"}, Out: out, Web: web, Version: "v1", Generated: "now"})
	if err != nil {
		t.Fatal(err)
	}
	read := func(p string) string {
		t.Helper()
		b, err := os.ReadFile(filepath.Join(out, p))
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	if read("index.html") != "page" {
		t.Error("the page wasn't copied")
	}
	if _, err := os.Stat(filepath.Join(out, "js/core.test.mjs")); err == nil {
		t.Error("tests were published")
	}
	if got := read("data/o/r/assets/1"); got != `{"schema":1}`+"\n" {
		t.Errorf("manifest bytes changed: %q", got)
	}
	read("data/o/r/assets/2")
	if _, err := os.Stat(filepath.Join(out, "data/o/r/assets/3")); err == nil {
		t.Error("an archive was copied; only letsgo.json and audit.json are")
	}
	var releases []Release
	if err := json.Unmarshal([]byte(read("data/o/r/releases.json")), &releases); err != nil || len(releases) != 1 || releases[0].Assets["letsgo.json"] != 1 {
		t.Errorf("releases = %+v (%v); drafts must be left out", releases, err)
	}
	if cfg := read("api/config"); !strings.Contains(cfg, `"mode":"static"`) || !strings.Contains(cfg, `"o/r@cli/"`) {
		t.Errorf("config = %s", cfg)
	}
}

func TestWriteRefusesAPrivateRepository(t *testing.T) {
	srv := fakeGitHub(t, true)
	err := Write(context.Background(), Options{API: srv.URL, Projects: []string{"o/r"}, Out: t.TempDir(), Web: fstest.MapFS{}})
	if err == nil || !strings.Contains(err.Error(), "private") {
		t.Errorf("err = %v, want a refusal naming the repository as private", err)
	}
}

func TestWriteRetriesAFlakyRead(t *testing.T) {
	var asset1 atomic.Int32
	inner := fakeGitHub(t, false)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/o/r/releases/assets/1" && asset1.Add(1) <= 2 {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		proxyTo(inner.URL, w, r)
	}))
	t.Cleanup(srv.Close)

	out := t.TempDir()
	err := Write(context.Background(), Options{API: srv.URL, Projects: []string{"o/r"}, Out: out, Web: fstest.MapFS{}, RetryDelay: time.Millisecond})
	if err != nil {
		t.Fatalf("a read that fails twice then succeeds failed the build: %v", err)
	}
	if asset1.Load() != 3 {
		t.Errorf("the flaky asset was requested %d times, want 3", asset1.Load())
	}
}

func TestWriteDoesNotRetryAnAnswerThatWillNotChange(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		http.NotFound(w, nil)
	}))
	t.Cleanup(srv.Close)
	err := Write(context.Background(), Options{API: srv.URL, Projects: []string{"o/r"}, Out: t.TempDir(), Web: fstest.MapFS{}, RetryDelay: time.Millisecond})
	if err == nil || calls.Load() != 1 {
		t.Errorf("err = %v after %d calls; a 404 should fail at once", err, calls.Load())
	}
}

func proxyTo(base string, w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get(base + r.URL.RequestURI()) //nolint:noctx,gosec // a test double
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
