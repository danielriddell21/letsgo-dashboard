# letsgo dashboard

A dashboard for the people who install Go tools released with
[letsgo](https://github.com/danielriddell21/letsgo): search for any public
repository and pin it, to see which version to use, how to install it, what
changed, and how the release was made. Repositories released with letsgo are
supported in full and sit at the top, in green; any other repository still
shows its releases and downloads. See [docs/search-and-pin.md](docs/search-and-pin.md).

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
