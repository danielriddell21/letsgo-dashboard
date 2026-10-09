// letsgo.mod

// The dashboard ships as a binary and as a container image. letsgo builds the
// image from the same reproducible linux binaries the release archives hold,
// so there is no Dockerfile to drift from them.
image ghcr.io/danielriddell21/letsgo-dashboard

// No shell and not root. The server writes nothing, so it runs on a
// read-only filesystem. Pinned by digest, so two releases of one commit are
// the same image; bump it deliberately.
image base gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
image expose 8080
