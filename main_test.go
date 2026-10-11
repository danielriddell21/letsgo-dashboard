package main

import (
	"context"
	"os/exec"
	"testing"
	"time"

	"github.com/danielriddell21/letsgo-dashboard/internal/config"
)

// TestPageLogic runs the page's own tests (web/js/*.test.mjs) with Node, so
// they gate CI and tagging alongside the Go ones. It skips where Node isn't
// installed.
func TestPageLogic(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	out, err := exec.Command(node, "--test", "web/js/core.test.mjs").CombinedOutput()
	if err != nil {
		t.Fatalf("node --test: %v\n%s", err, out)
	}
}

// TestServerStopsCleanly checks that cancelling the context (as SIGTERM
// does) shuts the server down and returns no error.
func TestServerStopsCleanly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runServer(ctx, config.Config{}, []string{"-addr", "127.0.0.1:0"}) }()
	time.Sleep(100 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runServer = %v, want nil", err)
		}
	case <-time.After(shutdownGrace):
		t.Fatal("runServer did not return after cancel")
	}
}
