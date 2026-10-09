package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// exchange trades a sign-in code for the viewer's token. GitHub's token
// endpoint doesn't answer browsers, and the app's secret can't be in the
// page, so this is the one step that needs a server. The token is returned
// to the browser and not kept.
type exchange struct {
	cfg    Config
	client *http.Client
}

func (e *exchange) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if e.cfg.ClientID == "" || e.cfg.ClientSecret == "" {
		fail(w, http.StatusNotFound, "sign-in with GitHub isn't set up on this server")
		return
	}
	if !sameOrigin(r) {
		fail(w, http.StatusForbidden, "sign-in must come from this dashboard")
		return
	}
	var in struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"code_verifier"`
		RedirectURI  string `json:"redirect_uri"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&in); err != nil || in.Code == "" || in.CodeVerifier == "" {
		fail(w, http.StatusBadRequest, "a code and a code verifier are required")
		return
	}

	form := url.Values{
		"client_id":     {e.cfg.ClientID},
		"client_secret": {e.cfg.ClientSecret},
		"code":          {in.Code},
		"code_verifier": {in.CodeVerifier},
	}
	if in.RedirectURI != "" {
		form.Set("redirect_uri", in.RedirectURI)
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, e.cfg.web()+"/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		fail(w, http.StatusInternalServerError, "sign-in failed")
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		fail(w, http.StatusBadGateway, "GitHub could not be reached")
		return
	}
	defer func() { _ = resp.Body.Close() }()

	var out struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&out); err != nil || out.AccessToken == "" {
		msg := "GitHub did not accept the sign-in"
		if out.Error != "" {
			msg += ": " + out.Error
		}
		fail(w, http.StatusBadRequest, msg)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"access_token": out.AccessToken})
}

// sameOrigin reports whether a browser request came from this server's own
// page. A request with no Origin header didn't come from a browser page.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host == r.Host
}
