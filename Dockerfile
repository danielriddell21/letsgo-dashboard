# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
ARG VERSION=dev TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -buildvcs=false -ldflags "-s -w -X main.version=${VERSION}" -o /out/letsgo-dashboard .

# No shell, no package manager, not root. The server writes nothing, so the
# filesystem can be mounted read-only.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/letsgo-dashboard /letsgo-dashboard
USER nonroot:nonroot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["/letsgo-dashboard", "-healthcheck"]
ENTRYPOINT ["/letsgo-dashboard"]
