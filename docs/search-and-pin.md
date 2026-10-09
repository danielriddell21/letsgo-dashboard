# Search and pin any public repository

Status: built. This is the design the code follows.

## What it is for

The dashboard started as a view of projects released with letsgo. People also
want to keep an eye on repositories that aren't, in one place, and to find a
repository without typing its exact name. So:

- a **search bar** finds any public repository on GitHub, and **pins** it
- a pinned repository whose releases were **made with letsgo** is supported in
  full, and is shown at the top with a green *letsgo* label
- any other pinned repository still works, with the part of the page that
  doesn't depend on letsgo, under a grey *Releases only* label

The look is GitHub's: the same search box, result rows, labels and buttons as
github.com.

## Supported, and what that means

A release is *made with letsgo* when it has a `letsgo.json` attached. A pinned
repository is **supported** when any of its releases are. The two views:

| | made with letsgo | releases only |
| --- | --- | --- |
| versions, pre-releases, latest, "update available" | yes | yes |
| retraction notices | yes | when the release body carries one |
| downloads, with GitHub's own SHA-256 per file | yes | yes |
| verify a file against a release | yes | yes (GitHub's digests) |
| audits and advisories, gates, provenance | yes | no |
| dependencies, plugins, fingerprint | yes | no |
| what changed between versions | yes | no |
| `go install`, install script, Docker | yes | no |

A release is never shown as healthier than it is: without a `letsgo.json` the
status says *Not made with letsgo*, not *No known issues*.

## Where the data comes from

| | server | GitHub Pages |
| --- | --- | --- |
| repository search | through the server | straight from `api.github.com` |
| release list, repository details | through the server | the snapshot when the repository is in it, otherwise `api.github.com` |
| `letsgo.json`, `audit.json` | through the server | the snapshot only |

GitHub's API answers browsers, but its release downloads don't, so a Pages site
can read a repository's `letsgo.json` only if the build fetched it
(`PAGES_REPOS`). A pinned repository outside the snapshot has its release list
and files, and says that the full view needs the dashboard server.

A Pages site knows which repositories its build fetched from its own
configuration (`api/config`, the `PAGES_REPOS` list: by default letsgo and this
dashboard), so it never has to probe for them.

Anonymous browser requests share GitHub's 60 an hour per address. The page says
so when it's reached, rather than failing silently. Search is 10 an hour.

## Pinning

A pin is `owner/repo` or `owner/repo@prefix/`, kept in the browser's local
storage with the rest of the settings. Typing an exact `owner/repo` offers it
first, without a search. Ordering on the overview is: supported repositories
(green), then those still loading, then releases-only ones, each in the order
pinned.

## Not doing

- Searching *for* letsgo repositories. GitHub can't filter by attached files,
  so supported is learned after pinning, from the release list.
- Private repositories on Pages. They need the server and a sign-in.
