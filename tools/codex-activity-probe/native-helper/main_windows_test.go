package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"io"
	"net"
	"strings"
	"testing"
	"time"
)

const validTool = `{"hook_event_name":"PreToolUse","session_id":"session-private","turn_id":"turn-private","tool_use_id":"tool-private","tool_input":{"command":"tool-canary"},"prompt":"prompt-canary","transcript_path":"path-canary","cwd":"workspace-canary","credentials":"secret-canary"}`

func TestProjectAllowlist(t *testing.T) {
	key := bytes.Repeat([]byte{1}, 32)
	result := project(strings.NewReader(validTool), key, "A", "PreToolUse", 100)
	if result == nil || result.Tool == nil || result.Turn == nil || result.Event != "tool-started" {
		t.Fatal("valid tool event was not projected")
	}
	out, err := json.Marshal(result)
	if err != nil || bytes.Contains(out, []byte("private")) || bytes.Contains(out, []byte("canary")) {
		t.Fatal("private input appeared in the projection")
	}
	other := project(strings.NewReader(validTool), bytes.Repeat([]byte{2}, 32), "B", "PreToolUse", 100)
	if other == nil || other.Session == result.Session {
		t.Fatal("workspaces must have independent pseudonyms")
	}
	for _, bad := range []string{
		"{", "[]", validTool + "{}",
		strings.Replace(validTool, `"PreToolUse"`, `"PermissionRequest"`, 1),
		strings.Replace(validTool, `"turn-private"`, `null`, 1),
		strings.Replace(validTool, `"turn-private"`, `{}`, 1),
		`{"session_id":"first",` + validTool[1:],
		strings.Repeat(" ", maxInput) + validTool,
	} {
		if project(strings.NewReader(bad), key, "A", "PreToolUse", 100) != nil {
			t.Fatal("malformed, duplicate, unsupported or oversized event was accepted")
		}
	}
}

func TestRuntimeArguments(t *testing.T) {
	valid := `C:\Folder with spaces\Pawmetry-activity-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\workspace-a`
	if !validRun(valid, "A") || validRun(valid, "B") || validRun(valid+`\..\workspace-a`, "A") ||
		validRun(`\\host\share\Pawmetry-activity-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\workspace-a`, "A") {
		t.Fatal("workspace route validation failed")
	}
}

func TestDeliveryRequiresReceiverProof(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan bool, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			done <- false
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(time.Second))
		challenge := make([]byte, 16)
		rand.Read(challenge)
		conn.Write(challenge)
		hello := make([]byte, 17)
		if _, err := io.ReadFull(conn, hello); err != nil {
			done <- false
			return
		}
		conn.Write(make([]byte, 32))
		var value [1]byte
		_, err = conn.Read(value[:])
		done <- err == io.EOF
	}()
	if deliver(listener.Addr().(*net.TCPAddr).Port, bytes.Repeat([]byte{1}, 32), "A", []byte(`{"sample":"fixture"}`), time.Now().Add(time.Second)) {
		t.Fatal("unproven receiver acknowledged a delivery")
	}
	if !<-done {
		t.Fatal("helper sent a frame without receiver proof")
	}
}
