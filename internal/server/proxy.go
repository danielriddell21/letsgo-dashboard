package server

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/danielriddell21/letsgo-dashboard/internal/github"
)

// maxBody bounds anything relayed. A manifest is tens of kilobytes; a release
// list of a hundred is a few hundred.
const maxBody = 8 << 20

// route is one GitHub read the proxy relays.
type route struct {
	path  *regexp.Regexp
	query []string
	asset bool
}

const name = github.Name

// routes are the only GitHub calls relayed, all reads. Anything else is
// refused, so the server can't be used as an open proxy into GitHub.
var routes = []route{
	{path: regexp.MustCompile(`^/user$`)},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `$`)},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `/releases$`), query: []string{"per_page", "page"}},
	{path: regexp.MustCompile(`^/repos/` + name + `/` + name + `/releases/assets/[0-9]{1,20}$`), asset: true},
	{path: regexp.MustCompile(`^/users/` + name + `/repos$`), query: []string{"per_page", "page", "type", "sort"}},
	{path: regexp.MustCompile(`^/orgs/` + name + `/repos$`), query: []string{"per_page", "page", "type", "sort"}},
	{path: regexp.MustCompile(`^/user/repos$`), query: []string{"per_page", "page", "affiliation", "sort"}},
	{path: regexp.MustCompile(`^/search/repositories$`), query: []string{"q", "per_page", "page", "sort", "order"}},
}

func matchRoute(path string) (route, bool) {
	for _, rt := range routes {
		if rt.path.MatchString(path) {
			return rt, true
		}
	}
	return route{}, false
}

// target is the GitHub URL for a request, carrying only the query
// parameters the route allows.
func (rt route) target(api, path string, in url.Values) string {
	q := url.Values{}
	for _, k := range rt.query {
		if v := in.Get(k); v != "" {
			q.Set(k, v)
		}
	}
	if len(q) == 0 {
		return api + path
	}
	return api + path + "?" + q.Encode()
}

// relayed are the response headers passed on to the browser.
var relayed = []string{"Content-Type", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-OAuth-Scopes"}

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
	rt, ok := matchRoute(path)
	if !ok {
		fail(w, http.StatusForbidden, "this server relays only the GitHub reads the dashboard needs")
		return
	}

	accept := github.JSON
	if rt.asset {
		accept = github.OctetStream
	}
	resp, err := p.get(r.Context(), rt.target(p.cfg.api(), path, r.URL.Query()), p.token(r), accept, rt.asset)
	if err != nil {
		fail(w, http.StatusBadGateway, "GitHub could not be reached")
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.ContentLength > maxBody {
		fail(w, http.StatusBadGateway, "the file is too large to relay")
		return
	}

	for _, h := range relayed {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	if rt.asset && resp.StatusCode == http.StatusOK {
		cacheAsset(w.Header())
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, maxBody))
}

// token is the viewer's own, or the deployment's public one.
func (p *proxy) token(r *http.Request) string {
	t, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return cmp.Or(strings.TrimSpace(t), p.cfg.PublicToken)
}

// cacheAsset lets the browser keep a release file: an asset's ID is never
// reused, so the bytes behind it don't change. Vary: Authorization keeps a
// private repository's file from being served to a request that doesn't carry
// the same token, such as after signing out.
func cacheAsset(h http.Header) {
	h.Set("Content-Type", github.OctetStream)
	h.Set("Cache-Control", "private, max-age=86400")
	h.Set("Vary", "Authorization")
}

// get makes the request, following an asset's redirect to an allowed host
// without the token: the redirect URL is already signed, and GitHub's token
// must not reach another host.
func (p *proxy) get(ctx context.Context, target, token, accept string, asset bool) (*http.Response, error) {
	// target is the configured API base plus a path that matched a route
	// above, so it can't name another host.
	resp, err := p.do(ctx, target, token, accept)
	if err != nil || !asset || !github.IsRedirect(resp.StatusCode) {
		return resp, err
	}
	_ = resp.Body.Close()

	loc, err := url.Parse(resp.Header.Get("Location"))
	if err != nil || !p.assetHost(loc) {
		return nil, errors.New("proxy: asset redirected to an unexpected host")
	}
	return p.do(ctx, loc.String(), "", github.OctetStream)
}

func (p *proxy) do(ctx context.Context, target, token, accept string) (*http.Response, error) {
	req, err := github.NewRequest(ctx, target, token, accept)
	if err != nil {
		return nil, fmt.Errorf("proxy: %w", err)
	}
	resp, err := p.client.Do(req) //nolint:gosec // G704: path allowlisted in ServeHTTP, redirect host checked by assetHost
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
