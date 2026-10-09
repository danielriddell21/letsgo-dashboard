# Discovery: a letsgo dashboard

> Status: done. This is the discovery that led to this repository, kept as
> the record of why it looks the way it does. Written while the idea still
> lived in letsgo itself, so it refers to letsgo's code.

## Where it ended up

- **Its own repository**, not a `letsgo` command. letsgo's packages are
  internal, and a web app is better off with its own release cadence.
- **For consumers, across many projects.** Any `owner/repo` or monorepo
  module can be watched; no organisation is configured unless the deployment
  sets defaults.
- **Live from GitHub, nothing stored on the server.** The browser reads each
  release's `letsgo.json` and `audit.json` and keeps settings, token and a
  cache in localStorage. A small server relays an allowlist of read-only
  GitHub calls, because GitHub's release downloads send no CORS headers, and
  handles "Sign in with GitHub" when configured.
- **Private repositories** through each viewer's own GitHub access: a pasted
  `gh auth token`, or a GitHub App sign-in. No Enterprise Cloud needed.
- **Dropped:** a static page rendered by letsgo, a hosted page reading a
  prebuilt data file from a repository, and a `catalog.json` export. The live
  app needs none of them.

The rest of this note is the discovery as written.

## The question

letsgo already knows a lot about every release it makes: the manifest,
gates, API delta, toolchain, images, tap files, promotion chain, plan record,
and later the audit history. Today that knowledge is spread across `verify`,
`diff`, `audit`, `plan` and the release body, each answering one question
about one or two releases. Nothing shows a project's releases **as a whole,
over time**.

A dashboard is the place that answers "is my release history healthy, and
can someone trust it?" at a glance.

## Who would look at it

| who | question | today |
| --- | --- | --- |
| Maintainer | Which supported releases are affected by a vuln right now? | `letsgo audit`, per run log |
| Maintainer | Is the binary growing? Did a dep bump sneak in? | `letsgo diff a b`, two at a time |
| Maintainer | Which releases were yanked, promoted, applied from a plan? | read release pages one by one |
| Consumer | Is the version I'm about to install clean and verifiable? | `letsgo verify` (needs Go + a rebuild) |
| Consumer | Does the binary I have match the published one? | compare digests by hand; randomart / PGP words |
| Security reviewer | Which gates ran, which were disabled, from what toolchain? | manifest JSON |

The consumer row is the interesting one: letsgo's pitch is integrity, and
the people who most need that evidence are the ones least likely to run
`letsgo verify`.

## What it can be built from today

Everything below is a **public release asset** or derivable from one, so a
dashboard for a public repo needs no token and makes no write.

| source | gives | where |
| --- | --- | --- |
| `letsgo.json` (manifest) | version, tag, commit, source date, toolchain, builder + plugins, modules, gates, API changes, artifacts (digests, sizes, targets), SBOM name, images, features, tap files, `promoted_from`, plan record | `manifest/manifest.go` |
| `audit.json` | dated audit history per release, findings | `internal/audit`, ADR-0012 |
| forge release list | draft / prerelease / immutable, yanked state, URLs | `internal/releases` |
| `diff.Compare(from, to)` | size, dependency, API and toolchain deltas between any two manifests, already rendered as text / md / json | `internal/diff` |
| fingerprints | randomart and PGP words from the manifest digest | `internal/randomart`, `internal/pgpwords`, ADR-0014 |
| `go.mod` retract directives | yank reasons | `internal/yank` |

Selection rules (scope, drafts, yanks, previous-by-kind) already live once in
`internal/releases` (ADR-0024), so a dashboard reuses them rather than
inventing its own idea of "the latest release".

### Gaps

- **Verification isn't recorded.** `verify` prints and exits; nothing
  remembers that release X was rebuilt and matched on date D. A dashboard can
  show what was *claimed* and what was *audited*, but not what was
  *independently verified*. A `verify.json` alongside `audit.json`
  (append-only, outside the integrity set — the ADR-0012 pattern) would close
  that, and letsgo-action could run it on a schedule like audit.
- **No download counts.** `releases.Asset` drops the forge's
  `download_count`. Cheap to add, but adoption stats are a distribution
  concern, arguably off-message.
- **Monorepos.** One dashboard per module, or one per repo grouped by tag
  prefix? `discover.Scope` makes either possible.

## Candidate panels

Ranked by how directly they serve the integrity story.

1. **Release timeline.** Every release by version: stable / prerelease /
   draft / yanked (with reason), promotion arrows RC → stable, a marker for
   "applied from a saved plan".
2. **Supported-lines health.** The newest stable of each major (audit's
   AU-1 rule): latest audit status and date, findings, last verified (once
   recorded).
3. **Release card.** One release: fingerprint (randomart + PGP words),
   commit, source date, toolchain, gates passed, features disabled/required,
   artifacts × targets matrix with digests, images with index digest, SBOM
   link, `install.sh` / brew / `go install` lines, and the exact
   `letsgo verify <tag>` command.
4. **Trends.** Binary size per target across releases, dependency count,
   toolchain version changes, API changes per release (breaking vs added).
   All from consecutive manifests via `diff.Compare`.
5. **Gate history.** Which gates ran on which release; a gate that quietly
   went from `pass` to absent (disabled) is worth seeing.
6. **Repo state** (maintainer only, local). `doctor --json` and
   `plan --json`: what the next release would be and whether it would pass.

## Shapes it could take

| shape | how | for | cost |
| --- | --- | --- | --- |
| **A. Static site** | `letsgo dashboard -o site/` renders HTML (+ the JSON it used) from published releases; letsgo-action `command: dashboard` deploys to GitHub Pages on each release and audit run | consumers, maintainers, reviewers | low: read-only, no server, no token for public repos |
| B. Local server | `letsgo dashboard --serve` on localhost, live, can include `doctor` / `plan` | maintainers | medium: adds an HTTP surface to a zero-dep tool |
| C. Release-body / job-summary | extend the "what shipped" section and `plan --format md` with history | maintainers on GitHub | lowest, but no cross-release view |
| D. TUI | `letsgo dashboard` in the terminal | maintainers | medium, nothing consumers can open |
| E. Hosted multi-repo service | a site indexing many letsgo projects | ecosystem | high, and a third party vouching for integrity undercuts the point |

### Leaning: A, with B as a flag later

- **Matches ADR-0008 ("the binary is the brain").** The renderer is letsgo,
  the data is `--json`-shaped, the action is a thin wrapper. No second
  implementation of release selection to drift.
- **Matches ADR-0018.** Core renders the evidence itself rather than
  depending on an optional install.
- **Fits the integrity story.** The page embeds the manifests it was built
  from with their digests, so it is itself checkable: a consumer (or
  `letsgo verify`) can confirm the page shows what the release assets say.
  It should say plainly that it *displays* evidence and is not a substitute
  for `verify`.
- **Zero dependencies.** `html/template` + inline CSS/SVG covers the charts;
  randomart is already text.

## Direction: a consumer page that watches several projects

Revised after review. The primary reader is a **consumer**: someone who
installs tools released with letsgo, often several of them. The page should
cover every feature and plugin a manifest can record, and watch one
repository or many (a monorepo module counts as its own project, named by
its tag prefix).

What the consumer does on it:

- **Pick the version they run** on each project and get one verdict:
  install X, update to X, affected by an advisory (fixed in X), or yanked.
- **Check a download**: drop a file and it is hashed in the browser and
  matched against every archive, binary, source archive, manifest and image
  digest on the page. Nothing is uploaded.
- **Install** through each channel the release offers: a direct download
  for their platform (including variants), the install script, `go install`
  (module path with the tag prefix removed), Homebrew formula, cask (from
  `tap_files`), container image by digest.
- **"Can I trust it?"**: the manifest's evidence written as consumer
  statements: audit history, vulnerability gate (following `promoted_from`
  when a stable didn't record it), reproducibility, source archive,
  promotion chain digest, plan record, sumdb, API changes, SBOM, required and
  disabled features, plugins (hook, command, version, digest).
- **Across projects**: advisories that hit the versions they run, and "who
  uses this module?" over every manifest's dependency list.
- **What changes when I update**: API, dependencies, toolchain, size on their
  platform, advisories fixed, yanked releases skipped.

Adding a project happens where the page is built: a `watch owner/name
[prefix/]` line in a `dashboard.mod`, or `--watch` on the command line.

### Gaps the prototype exposed

- **Install channels aren't in the manifest.** The tap and formula name, the
  cask token and whether an install script was published are config, not
  manifest. A consumer page built from release assets can't find them.
- **Yank reasons live in the release body.** `releases.IsRetracted` reads a
  body prefix; the reason should be machine-readable.
- **Promoted stables drop gate results** (7 of 11 on letsgo's own
  releases), so the page has to walk to the RC to show them.
- **Randomart titles say "letsgo"** (`randomart.Title`), which reads oddly on
  another project's page.
- **Vulnerability gate has been skipped** on every letsgo release so far.

## Open questions

1. Is the dashboard part of the integrity set? Proposal: no — like
   `audit.json`, it's derived, rebuildable, and never in `SHA256SUMS`.
2. Persist verify results (`verify.json`)? Needed for panel 2 to say
   "verified", and probably its own feature/PRD.
3. Pages branch vs. a release asset (`dashboard.html` on each release)?
   Pages gives one stable URL; an asset is immutable-release friendly.
4. Feature catalogue entry: on by default in the action, or opt-in?
5. Monorepo grouping (per module vs per repo).
6. Private repos: token-only, so Pages may not apply; local output only?
7. Download counts: in or out?

## Suggested next steps

1. Spike: `letsgo dashboard -o site/` rendering panels 1, 3 and 4 for
   letsgo's own releases, from `internal/releases` + `diff`. Measures how
   much is genuinely new code.
2. Decide Q1–Q3, write PRD / HLD / PBS / ADR per `docs/README.md`.
3. Separate PRD for recorded verification (`verify.json`), which the
   dashboard wants but which stands on its own.
