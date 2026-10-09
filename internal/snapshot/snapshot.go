// Package snapshot writes the dashboard as a static site: the page, and the
// GitHub data it would otherwise fetch through the server, for a fixed list
// of public repositories. GitHub Pages can host the result, because nothing
// is left for a server to do: the release files a browser can't download
// from GitHub are already in the site.
package snapshot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Options describe one snapshot.
type Options struct {
	// API is the GitHub REST API base URL. Empty means https://api.github.com.
	API string

	// Token reads the repositories. Optional for public ones, but without it
	// GitHub's anonymous rate limit is soon reached.
	Token string

	// Projects are owner/name or owner/name@prefix/, as the page takes them.
	Projects []string

	// Out is the directory the site is written to.
	Out string

	// Web is the page itself.
	Web fs.FS

	// Version and Generated are shown in the page footer.
	Version, Generated string

	Client *http.Client

	// RetryDelay is the pause before a second try, doubling-ish after that.
	// Zero means a second.
	RetryDelay time.Duration
}

// Files the release list keeps per release. Only these are copied.
var keep = []string{"letsgo.json", "audit.json"}

var spec = regexp.MustCompile(`^([A-Za-z0-9_.-]{1,100})/([A-Za-z0-9_.-]{1,100})(@[A-Za-z0-9_./-]+)?$`)

// Release is a release as the page reads it, trimmed to what it uses.
type Release struct {
	Tag       string           `json:"tag"`
	Draft     bool             `json:"draft"`
	URL       string           `json:"url"`
	Published string           `json:"published"`
	Body      string           `json:"body"`
	Assets    map[string]int64 `json:"assets"`
	Files     []File           `json:"files"`
}

// File is a release file as the releases-only view lists it: what GitHub
// reports, including the SHA-256 of its bytes.
type File struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Digest string `json:"digest"`
	URL    string `json:"url"`
}

// Repo is a repository as the page reads it.
type Repo struct {
	Private     bool   `json:"private"`
	Description string `json:"description"`
	Avatar      string `json:"avatar"`
	URL         string `json:"url"`
}

// Write builds the site in o.Out.
func Write(ctx context.Context, o Options) error {
	if o.Client == nil {
		o.Client = &http.Client{Timeout: time.Minute}
	}
	if o.API == "" {
		o.API = "https://api.github.com"
	}
	o.API = strings.TrimRight(o.API, "/")
	if len(o.Projects) == 0 {
		return errors.New("snapshot: no projects; name at least one owner/name")
	}

	repos := []string{}
	seen := map[string]bool{}
	for _, p := range o.Projects {
		m := spec.FindStringSubmatch(p)
		if m == nil {
			return fmt.Errorf("snapshot: %q is not owner/name or owner/name@prefix/", p)
		}
		if r := m[1] + "/" + m[2]; !seen[r] {
			seen[r] = true
			repos = append(repos, r)
		}
	}

	if err := copyFS(o.Out, o.Web); err != nil {
		return err
	}
	for _, r := range repos {
		if err := o.repo(ctx, r); err != nil {
			return err
		}
	}

	cfg := map[string]any{
		"mode": "static", "oauth": false, "web": "https://github.com",
		"defaults": o.Projects, "version": o.Version, "generated": o.Generated,
	}
	return writeJSON(filepath.Join(o.Out, "api", "config"), cfg)
}

func (o Options) repo(ctx context.Context, full string) error {
	dir := filepath.Join(o.Out, "data", filepath.FromSlash(full))

	var meta struct {
		Private     bool   `json:"private"`
		Description string `json:"description"`
		HTMLURL     string `json:"html_url"`
		Owner       struct {
			AvatarURL string `json:"avatar_url"`
		} `json:"owner"`
	}
	if err := o.getJSON(ctx, "/repos/"+full, &meta); err != nil {
		return err
	}
	// A Pages site is public. Publishing a private repository's releases
	// there would publish them to everyone.
	if meta.Private {
		return fmt.Errorf("snapshot: %s is private, and a GitHub Pages site is public; run the dashboard server for private repositories", full)
	}
	if err := writeJSON(filepath.Join(dir, "repo.json"), Repo{Description: meta.Description, Avatar: meta.Owner.AvatarURL, URL: meta.HTMLURL}); err != nil {
		return err
	}

	var releases []Release
	for page := 1; page <= 10; page++ {
		var batch []struct {
			TagName     string `json:"tag_name"`
			Draft       bool   `json:"draft"`
			HTMLURL     string `json:"html_url"`
			PublishedAt string `json:"published_at"`
			Body        string `json:"body"`
			Assets      []struct {
				ID                 int64  `json:"id"`
				Name               string `json:"name"`
				Size               int64  `json:"size"`
				Digest             string `json:"digest"`
				BrowserDownloadURL string `json:"browser_download_url"`
			} `json:"assets"`
		}
		if err := o.getJSON(ctx, fmt.Sprintf("/repos/%s/releases?per_page=100&page=%d", full, page), &batch); err != nil {
			return err
		}
		for _, b := range batch {
			if b.Draft {
				continue
			}
			r := Release{Tag: b.TagName, URL: b.HTMLURL, Published: b.PublishedAt, Body: truncate(b.Body, 2000), Assets: map[string]int64{}}
			for _, a := range b.Assets {
				r.Assets[a.Name] = a.ID
				r.Files = append(r.Files, File{Name: a.Name, Size: a.Size, Digest: a.Digest, URL: a.BrowserDownloadURL})
			}
			releases = append(releases, r)
		}
		if len(batch) < 100 {
			break
		}
	}
	if err := writeJSON(filepath.Join(dir, "releases.json"), releases); err != nil {
		return err
	}
	return o.assets(ctx, full, dir, releases)
}

// assets copies each release's letsgo.json and audit.json byte for byte: the
// page hashes the manifest to draw its fingerprint.
func (o Options) assets(ctx context.Context, full, dir string, releases []Release) error {
	var ids []int64
	for _, r := range releases {
		if _, ok := r.Assets["letsgo.json"]; !ok {
			continue
		}
		for _, name := range keep {
			if id, ok := r.Assets[name]; ok {
				ids = append(ids, id)
			}
		}
	}
	errs := make([]error, len(ids))
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			data, err := o.get(ctx, fmt.Sprintf("/repos/%s/releases/assets/%d", full, id), "application/octet-stream")
			if err == nil {
				err = writeFile(filepath.Join(dir, "assets", fmt.Sprint(id)), data)
			}
			errs[i] = err
		}()
	}
	wg.Wait()
	return errors.Join(errs...)
}

func (o Options) getJSON(ctx context.Context, path string, v any) error {
	data, err := o.get(ctx, path, "application/vnd.github+json")
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("snapshot: %s: %w", path, err)
	}
	return nil
}

// attempts is how many times a read is tried: GitHub answers an occasional
// 5xx, and one of them shouldn't fail a scheduled build of hundreds of reads.
const attempts = 4

// get reads one API path, trying again after a network error, a 5xx or a
// rate-limit answer. An asset download redirects to another host; Go's client
// drops the Authorization header when it follows that, as it should.
func (o Options) get(ctx context.Context, path, accept string) ([]byte, error) {
	delay := o.RetryDelay
	if delay == 0 {
		delay = time.Second
	}
	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		var data []byte
		var retry bool
		data, retry, err = o.getOnce(ctx, path, accept)
		if err == nil {
			return data, nil
		}
		if !retry || attempt == attempts {
			break
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("snapshot: %s: %w", path, ctx.Err())
		case <-time.After(delay * time.Duration(attempt)):
		}
	}
	return nil, err
}

// getOnce is one try, and whether trying again could help.
func (o Options) getOnce(ctx context.Context, path, accept string) (data []byte, retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.API+path, nil)
	if err != nil {
		return nil, false, fmt.Errorf("snapshot: %w", err)
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "letsgo-dashboard")
	if o.Token != "" {
		req.Header.Set("Authorization", "Bearer "+o.Token)
	}
	resp, err := o.Client.Do(req)
	if err != nil {
		return nil, true, fmt.Errorf("snapshot: %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		again := resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests
		return nil, again, fmt.Errorf("snapshot: %s: GitHub answered %s", path, resp.Status)
	}
	data, err = io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, true, fmt.Errorf("snapshot: %s: %w", path, err)
	}
	return data, false, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func writeJSON(path string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("snapshot: %w", err)
	}
	return writeFile(path, data)
}

func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("snapshot: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil { //nolint:gosec // a website is meant to be read
		return fmt.Errorf("snapshot: %w", err)
	}
	return nil
}

func copyFS(out string, web fs.FS) error {
	err := fs.WalkDir(web, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if strings.HasSuffix(path, ".test.mjs") {
			return nil
		}
		data, err := fs.ReadFile(web, path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}
		return writeFile(filepath.Join(out, filepath.FromSlash(path)), data)
	})
	if err != nil {
		return fmt.Errorf("snapshot: %w", err)
	}
	return nil
}
