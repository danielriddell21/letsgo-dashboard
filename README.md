# letsgo dashboard

A dashboard for the people who install Go tools released with
[letsgo](https://github.com/danielriddell21/letsgo). Watch any repositories
and see, for each one:

- which version to use, and whether the one you run needs an update, was
  retracted or has a known vulnerability, and which release fixes it
- how to install it on your platform: download, install script, `go install`
  or Docker
- what changes between your version and the newest: API, dependencies, Go
  version, download size
- what the release recorded about how it was made: audits, gates, promotion,
  release plan, plugins, SBOM, and the same fingerprint `letsgo verify` prints
- which of your projects use a given module, and whether a file you downloaded
  is one of their releases (hashed in your browser, never uploaded)

Nothing is configured in advance unless you want it to be: anyone can add any
`owner/repo`, a module of a monorepo (`owner/repo@cli/`), or browse an owner's
repositories.

## Run it

```sh
docker run --rm -p 8080:8080 --read-only ghcr.io/danielriddell21/letsgo-dashboard
```

Then open http://localhost:8080. Or download a binary from the
[releases](https://github.com/danielriddell21/letsgo-dashboard/releases), or:

```sh
go install github.com/danielriddell21/letsgo-dashboard@latest
```

The dashboard is released with letsgo, so its own releases can be checked
the way it checks everyone else's: `letsgo verify --repo
danielriddell21/letsgo-dashboard`. The image is built by letsgo from the
same reproducible linux binaries, on a distroless base pinned by digest.

## On GitHub Pages

The dashboard can also be published as a static site for **public**
repositories, with nothing running behind it:

```sh
letsgo-dashboard snapshot -o site owner/repo owner/other@cli/
```

writes the page and each project's release data (its release list, and each
release's `letsgo.json` and `audit.json`, byte for byte) into `site/`.
Viewers choose which of those projects to watch; everything else works as on
the server, except sign-in and adding other repositories. A private
repository is refused, because a Pages site is public.

This repository publishes one: `pages.yml` runs after CI passes on trunk and
every six hours, for the projects in the `PAGES_REPOS` repository variable
(default `danielriddell21/letsgo`). Turn it on under Settings → Pages →
Source: GitHub Actions.

## What is stored, and where

The server stores nothing: no database, no sessions, no logs of tokens. It
can run on a read-only filesystem.

Everything else is kept in your browser's local storage:

| what | why |
| --- | --- |
| watched projects, the version you use of each, theme, platform, layout | so the page is set up the way you left it |
| your GitHub token, if you sign in | to read private repositories and get a higher rate limit |
| GitHub responses (release lists, manifests, audits) | so a reload doesn't use your rate limit again |

Settings shows how much is stored, and can clear the cache or remove
everything. "Share your setup" exports your projects and layout, without your
token, to paste into another browser.

## Signing in

Public repositories work without signing in. To see private ones, sign in with
an account that can read them:

- **Paste a token.** Run `gh auth token` and paste the result, or create a
  fine-grained token with read access to Contents and Metadata.
- **Sign in with GitHub**, if the server is configured with a GitHub App (see
  below).

Either way, each viewer sees only what their own GitHub account can read.

## Configuration

All optional, as environment variables.

| variable | default | |
| --- | --- | --- |
| `ADDR` | `:8080` | address to listen on |
| `DASHBOARD_REPOS` | none | projects shown to a viewer who hasn't chosen any, comma-separated `owner/repo` or `owner/repo@prefix/` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | none | a GitHub App, to offer "Sign in with GitHub" |
| `DASHBOARD_PUBLIC_TOKEN` | none | a token used for viewers who haven't signed in, so they share its rate limit instead of the server's anonymous one. Give it access only to what everyone who can reach the server may see. |
| `GITHUB_API_URL`, `GITHUB_SERVER_URL` | github.com | for GitHub Enterprise Server |
| `DASHBOARD_ASSET_HOSTS` | GitHub's | hosts release downloads may redirect to, for GitHub Enterprise Server |

### A GitHub App for sign-in

1. Create a GitHub App (organisation or personal settings, Developer settings).
2. Callback URL: the dashboard's address, for example `https://dashboard.example.com/`.
3. Repository permissions: Contents read-only, Metadata read-only. Nothing else.
4. Install it on the repositories the dashboard should show, or on all of them.
5. Generate a client secret and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

A token from a GitHub App reads only what both the viewer and the app can
read, and expires after eight hours. Sign-in uses PKCE and a state check.

## How it works

The page is plain HTML, CSS and JavaScript with no dependencies. It reads
each release's `letsgo.json` and `audit.json` from GitHub.

Browsers can't download GitHub release files directly (GitHub's download host
sends no CORS headers), so the server relays a fixed list of read-only GitHub
API calls with the viewer's own token, and follows release download redirects
itself. Anything else is refused. The page's Content-Security-Policy lets it
talk only to its own server.

## Customising

Settings lets you choose the theme (system, light, dark, dark dimmed), your
platform, and which modules appear on the overview and project pages, in what
order.

## Develop

```sh
go run .                 # http://localhost:8080
go test ./...            # server, and the page's tests when Node is installed
node --test web/js/core.test.mjs  # page logic alone, including fingerprints checked against letsgo's own
```

## Releasing

CI is letsgo's: the shared `danielriddell21/github-actions` workflow vets,
lints, builds and tests every push, and on trunk tags a release candidate with
`letsgo tag --warranted --pre`. The tag starts `release.yml`, which publishes
the archives and the image with letsgo. Unticking "Set as a pre-release" on
the candidate runs `promote.yml`, which publishes the stable version and moves
the image's `latest`, major and major.minor tags.

The tag job pushes with the `TAG_TOKEN` secret, because a tag pushed with the
workflow token starts no workflow.
