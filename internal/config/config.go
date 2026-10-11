// Package config reads a deployment's settings from its environment. Every
// setting is optional; see README.md for what each one does.
package config

import (
	"cmp"
	"strings"

	"github.com/danielriddell21/letsgo-dashboard/internal/server"
)

// Config is everything the environment sets.
type Config struct {
	// Addr is the address the server listens on.
	Addr string

	// Server is the server's own configuration.
	Server server.Config

	// Token reads GitHub for a snapshot.
	Token string
}

// Load reads the settings through getenv, which is os.Getenv outside tests.
func Load(getenv func(string) string) Config {
	return Config{
		Addr: cmp.Or(getenv("ADDR"), ":8080"),
		Server: server.Config{
			API:          getenv("GITHUB_API_URL"),
			Web:          getenv("GITHUB_SERVER_URL"),
			ClientID:     getenv("GITHUB_CLIENT_ID"),
			ClientSecret: getenv("GITHUB_CLIENT_SECRET"),
			PublicToken:  getenv("DASHBOARD_PUBLIC_TOKEN"),
			Defaults:     List(getenv("DASHBOARD_REPOS")),
			AssetHosts:   List(getenv("DASHBOARD_ASSET_HOSTS")),
		},
		Token: cmp.Or(getenv("GITHUB_TOKEN"), getenv("GH_TOKEN")),
	}
}

// List splits a comma- or space-separated setting.
func List(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' })
}
