// Package github holds what the server and the snapshot both need to know
// about GitHub's REST API: where it is, what a name may look like, and how a
// request to it is made.
package github

import (
	"cmp"
	"context"
	"fmt"
	"net/http"
	"strings"
)

// The public GitHub's addresses, used when a deployment names no other.
const (
	DefaultAPI = "https://api.github.com"
	DefaultWeb = "https://github.com"
)

// Name matches an owner or repository name as GitHub allows them.
const Name = `[A-Za-z0-9_.-]{1,100}`

// Media types a request asks for.
const (
	JSON        = "application/vnd.github+json"
	OctetStream = "application/octet-stream"
)

// BaseURL is base without a trailing slash, or fallback when base is empty.
func BaseURL(base, fallback string) string {
	return cmp.Or(strings.TrimRight(base, "/"), fallback)
}

// NewRequest makes a GET for url with the headers GitHub expects, and the
// token if there is one.
func NewRequest(ctx context.Context, url, token, accept string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("github: %w", err)
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "letsgo-dashboard")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req, nil
}

// IsRedirect reports whether a status sends the client to Location.
func IsRedirect(status int) bool {
	switch status {
	case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther, http.StatusTemporaryRedirect:
		return true
	}
	return false
}
