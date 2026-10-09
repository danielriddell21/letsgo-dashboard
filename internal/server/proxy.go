package server

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// maxBody bounds anything relayed. A manifest is tens of kilobytes; a release
// list of a hundred is a few hundred.
const maxBody = 8 << 20

// name is an owner or repository name as GitHub allows them.
const name = `[A-Za-z0-9_.-]{1,100}`

// routes are the only GitHub calls relayed, all reads. Anything else is
// refused, so the server can't be used as an open proxy into GitHub.
var routes = []struct {
	path  *regexp.Regexp
	query []string
	asset bool
}{
	{path: regexp.MustCompile(`^/user$`)},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `$`)},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `/releases$`), query: []string{"per_page", "page"}},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `/releases/assets/[0-9]{1,20}$`), asset: true},
	{path: regexp.MustCompile(`^/users/` + name + `/repos$`), query: []string{"per_page", "page", "type", "sort"}},
	{path: regexp.MustCompile(`^/orgs/` + name + `/repos$`), query: []string{"per_page", "page", "type", "sort"}},
	{path: regexp.MustCompile(`^/user/repos$`), query: []string{"per_page", "page", "affiliation", "sort"}},
}

// proxy relays an allowed GitHub API read with the viewer's own token (or
// the deployment's public one), and follows a release asset's redirect
// itself: GitHub's asset host sends no CORS headers, which is the one reason
// this server exists.
type proxy struct {
	cfg    Config
	client *http.Client
}

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/gh")
	var allowed bool
	var keep []string
	var asset bool
	for _, rt := range routes {
		if rt.path.MatchString(path) {
			allowed, keep, asset = true, rt.query, rt.asset
			break
		}
	}
	if !allowed {
		fail(w, http.StatusForbidden, "this server relays only the GitHub reads the dashboard needs")
		return
	}

	q := url.Values{}
	for _, k := range keep {
		if v := r.URL.Query().Get(k); v != "" {
			q.Set(k, v)
		}
	}
	target := p.cfg.api() + path
	if len(q) > 0 {
		target += "?" + q.Encode()
	}

	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if token == "" {
		token = p.cfg.PublicToken
	}
	accept := "application/vnd.github+json"
	if asset {
		accept = "application/octet-stream"
	}

	resp, err := p.get(r.Context(), target, token, accept, asset)
	if err != nil {
		fail(w, http.StatusBadGateway, "GitHub could not be reached")
		return
	}
	defer func() { _ = resp.Body.Close() }()

	for _, h := range []string{"Content-Type", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-OAuth-Scopes"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	if asset && resp.StatusCode == http.StatusOK {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	if resp.ContentLength > maxBody {
		fail(w, http.StatusBadGateway, "the file is too large to relay")
		return
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, maxBody))
}

// get makes the request, following an asset's redirect to an allowed host
// without the token: the redirect URL is already signed, and GitHub's token
// must not reach another host.
func (p *proxy) get(ctx context.Context, target, token, accept string, asset bool) (*http.Response, error) {
	// target is the configured API base plus a path that matched a route
	// above, so it can't name another host.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil) //nolint:gosec // G704: path allowlisted in ServeHTTP
	if err != nil {
		return nil, fmt.Errorf("proxy: %w", err)
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "letsgo-dashboard")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := p.client.Do(req) //nolint:gosec // G704: path allowlisted in ServeHTTP
	if err != nil {
		return nil, fmt.Errorf("proxy: %w", err)
	}
	if !asset || (resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusMovedPermanently &&
		resp.StatusCode != http.StatusTemporaryRedirect && resp.StatusCode != http.StatusSeeOther) {
		return resp, nil
	}
	_ = resp.Body.Close()

	loc, err := url.Parse(resp.Header.Get("Location"))
	if err != nil || !p.assetHost(loc) {
		return nil, fmt.Errorf("asset redirected to an unexpected host")
	}
	next, err := http.NewRequestWithContext(ctx, http.MethodGet, loc.String(), nil) //nolint:gosec // G704: host checked by assetHost
	if err != nil {
		return nil, fmt.Errorf("proxy: %w", err)
	}
	next.Header.Set("Accept", "application/octet-stream")
	next.Header.Set("User-Agent", "letsgo-dashboard")
	resp, err = p.client.Do(next) //nolint:gosec // G704: host checked by assetHost
	if err != nil {
		return nil, fmt.Errorf("proxy: %w", err)
	}
	return resp, nil
}

func (p *proxy) assetHost(u *url.URL) bool {
	// Plain http only when the API itself is plain http, as a test server is.
	plainOK := u.Scheme == "http" && strings.HasPrefix(p.cfg.api(), "http://")
	if u.Scheme != "https" && !plainOK {
		return false
	}
	host := u.Hostname()
	for _, allowed := range p.cfg.assetHosts() {
		if host == strings.TrimPrefix(allowed, ".") || (strings.HasPrefix(allowed, ".") && strings.HasSuffix(host, allowed)) {
			return true
		}
	}
	return false
}
