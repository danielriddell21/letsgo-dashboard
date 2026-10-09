# letsgo dashboard

A dashboard for the people who install Go tools released with
[letsgo](https://github.com/danielriddell21/letsgo): watch any repositories and
see which version to use, how to install it, what changed, and how the release
was made.

```sh
docker run --rm -p 8080:8080 --read-only ghcr.io/danielriddell21/letsgo-dashboard
```

Then open http://localhost:8080. Binaries are on the
[releases](https://github.com/danielriddell21/letsgo-dashboard/releases) page.

Docs (running, GitHub Pages, sign-in, configuration, how it works, releasing)
are in the [letsgo wiki](https://github.com/danielriddell21/letsgo/wiki/Dashboard).

```sh
go run .        # develop: http://localhost:8080
go test ./...
```
