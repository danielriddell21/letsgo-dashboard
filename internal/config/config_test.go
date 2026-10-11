package config

import (
	"slices"
	"testing"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	c := Load(env(nil))
	if c.Addr != ":8080" || c.Token != "" || len(c.Server.Defaults) != 0 || c.Server.OAuth() {
		t.Fatalf("Load(empty) = %+v", c)
	}
}

func TestLoadReadsEverySetting(t *testing.T) {
	c := Load(env(map[string]string{
		"ADDR":                 ":9000",
		"GITHUB_CLIENT_ID":     "id",
		"GITHUB_CLIENT_SECRET": "secret",
		"DASHBOARD_REPOS":      "o/a, o/b@cli/\no/c",
		"GH_TOKEN":             "gh",
	}))
	if c.Addr != ":9000" || !c.Server.OAuth() || c.Token != "gh" {
		t.Fatalf("Load = %+v", c)
	}
	if want := []string{"o/a", "o/b@cli/", "o/c"}; !slices.Equal(c.Server.Defaults, want) {
		t.Fatalf("Defaults = %q, want %q", c.Server.Defaults, want)
	}
}

func TestGitHubTokenWinsOverGHToken(t *testing.T) {
	if c := Load(env(map[string]string{"GITHUB_TOKEN": "a", "GH_TOKEN": "b"})); c.Token != "a" {
		t.Fatalf("Token = %q, want a", c.Token)
	}
}
