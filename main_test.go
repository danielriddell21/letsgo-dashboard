package main

import (
	"os/exec"
	"testing"
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
