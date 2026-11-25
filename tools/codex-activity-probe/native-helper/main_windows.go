// Pawmetry's fixed-purpose Windows hook. No shell, child process, or provider API.
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unicode/utf8"
	"unsafe"
)

const (
	maxInput     = 64 * 1024
	budget       = 600 * time.Millisecond
	serverDomain = "pawmetry-hook-server-v3\x00"
	clientDomain = "pawmetry-hook-frame-v3\x00"
)

var events = map[string]string{
	"SessionStart": "session-started", "SessionEnd": "session-ended",
	"PreToolUse": "tool-started", "PostToolUse": "tool-ended",
	"PreModelRequest": "model-started", "PostModelRequest": "model-ended",
	"Interrupt": "interrupted", "Stop": "turn-stopped",
}

type observation struct {
	Workspace string  `json:"workspace"`
	Event     string  `json:"event"`
	Session   string  `json:"session"`
	Turn      *string `json:"turn"`
	Tool      *string `json:"tool"`
	SentAt    int64   `json:"sentAt"`
	Delivery  string  `json:"delivery"`
}

type diagnostic struct {
	Workspace string `json:"workspace"`
	SentAt    int64  `json:"sentAt"`
	Kind      string `json:"kind"`
	Challenge string `json:"challenge,omitempty"`
}

func main() {
	// The pure Go executable has no Node, CLR, shell, preload or plugin runtime.
	restrictEnvironment()
	args := os.Args[1:]
	if len(args) == 2 && args[0] == "guard" {
		os.Exit(guard(args[1]))
	}
	if len(args) == 1 && args[0] == "check" {
		if standardUser() {
			fmt.Println("standard")
		} else {
			fmt.Println("restricted")
		}
		return
	}
	if len(args) != 4 || (args[1] != "A" && args[1] != "B") || !validRun(args[2], args[1]) {
		return
	}
	mode, workspace, root, event := args[0], args[1], args[2], args[3]
	timer := time.AfterFunc(budget, func() { os.Exit(0) })
	defer timer.Stop()
	if mode == "hook" && event == "Stop" {
		fmt.Println("{}")
	}
	if mode != "probe" && (mode != "hook" || events[event] == "" || !standardUser()) {
		return
	}
	start := time.Now()
	port, key := capability(root, workspace)
	if key == nil {
		return
	}
	defer clear(key)
	var value any
	if mode == "probe" {
		if !lowerHex(event, 32) {
			return
		}
		value = diagnostic{workspace, start.UnixMilli(), "probe", event}
	} else if cwd, err := os.Getwd(); err != nil || !within(root, cwd) {
		value = diagnostic{Workspace: workspace, SentAt: start.UnixMilli(), Kind: "wrong-workspace"}
	} else {
		record := project(os.Stdin, key, workspace, event, start.UnixMilli())
		if record == nil {
			value = diagnostic{Workspace: workspace, SentAt: start.UnixMilli(), Kind: "unsupported-input"}
		} else {
			value = record
		}
	}
	payload, err := json.Marshal(value)
	if (err != nil || !deliver(port, key, workspace, payload, start.Add(budget))) && mode == "probe" {
		os.Exit(2)
	}
}

func restrictEnvironment() {
	os.Clearenv()
	// Winsock's system provider uses %SystemRoot%. Obtain it from Windows,
	// never from the invoking shell. No PATH or runtime options are restored.
	var path [260]uint16
	getWindows := syscall.NewLazyDLL("kernel32.dll").NewProc("GetSystemWindowsDirectoryW")
	n, _, _ := getWindows.Call(uintptr(unsafe.Pointer(&path[0])), uintptr(len(path)))
	if n > 0 && n < uintptr(len(path)) {
		os.Setenv("SystemRoot", syscall.UTF16ToString(path[:n]))
	}
}

func lowerHex(value string, size int) bool {
	if len(value) != size || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func validRun(root, workspace string) bool {
	if len(root) < 3 || root[1:3] != `:\` || !filepath.IsAbs(root) || filepath.Clean(root) != root {
		return false
	}
	if filepath.Base(root) != "workspace-"+strings.ToLower(workspace) {
		return false
	}
	name := filepath.Base(filepath.Dir(root))
	return strings.HasPrefix(name, "Pawmetry-activity-") && lowerHex(strings.TrimPrefix(name, "Pawmetry-activity-"), 32)
}

func within(root, cwd string) bool {
	if !filepath.IsAbs(cwd) {
		return false
	}
	root, cwd = strings.ToLower(filepath.Clean(root)), strings.ToLower(filepath.Clean(cwd))
	return (cwd == root || strings.HasPrefix(cwd, root+`\`)) && unredirected(root) && unredirected(cwd)
}

func unredirected(path string) bool {
	for {
		name, err := syscall.UTF16PtrFromString(path)
		if err != nil {
			return false
		}
		attrs, err := syscall.GetFileAttributes(name)
		if err != nil || attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
			return false
		}
		parent := filepath.Dir(path)
		if parent == path {
			return true
		}
		path = parent
	}
}

func capability(root, workspace string) (int, []byte) {
	parent := filepath.Dir(root)
	if !unredirected(parent) {
		return 0, nil
	}
	path := filepath.Join(parent, "ingress-"+strings.ToLower(workspace)+".bin")
	file, err := openLocal(path)
	if err != nil {
		return 0, nil
	}
	defer file.Close()
	var raw [35]byte
	n, err := io.ReadFull(file, raw[:])
	defer clear(raw[:])
	if err != io.ErrUnexpectedEOF || n != 34 {
		return 0, nil
	}
	port := int(binary.BigEndian.Uint16(raw[:2]))
	if port == 0 {
		return 0, nil
	}
	return port, bytes.Clone(raw[2:34])
}

func openLocal(path string) (*os.File, error) {
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, nil,
		syscall.OPEN_EXISTING, syscall.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, err
	}
	var info syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(handle, &info); err != nil ||
		info.FileAttributes&(syscall.FILE_ATTRIBUTE_REPARSE_POINT|syscall.FILE_ATTRIBUTE_DIRECTORY) != 0 || info.NumberOfLinks != 1 {
		syscall.CloseHandle(handle)
		return nil, os.ErrPermission
	}
	return os.NewFile(uintptr(handle), path), nil
}

func guard(expected string) int {
	path, err := os.Executable()
	if err != nil || !lowerHex(expected, 64) || filepath.Base(path) != "PawmetryActivity-"+expected+".exe" || !unredirected(path) {
		return 1
	}
	file, err := openLocal(path)
	if err != nil {
		return 1
	}
	defer file.Close()
	digest := sha256.New()
	n, err := io.Copy(digest, io.LimitReader(file, 16<<20))
	if err != nil || n == 16<<20 || hex.EncodeToString(digest.Sum(nil)) != expected {
		return 1
	}
	if standardUser() {
		fmt.Println("standard")
	} else {
		fmt.Println("restricted")
	}
	// Parent death closes this anonymous pipe and releases the deny-write/delete handle.
	var end [1]byte
	os.Stdin.Read(end[:])
	return 0
}

func validID(value string) bool {
	return strings.TrimSpace(value) != "" && len(utf16.Encode([]rune(value))) <= 256
}

func project(input io.Reader, key []byte, workspace, event string, at int64) *observation {
	raw, err := io.ReadAll(io.LimitReader(input, maxInput+1))
	defer clear(raw)
	if err != nil || len(raw) > maxInput || !utf8.Valid(raw) || !json.Valid(raw) {
		return nil
	}
	parser := json.NewDecoder(bytes.NewReader(raw))
	first, err := parser.Token()
	if first != json.Delim('{') || err != nil {
		return nil
	}
	fields := map[string]string{}
	for parser.More() {
		token, err := parser.Token()
		if err != nil {
			return nil
		}
		var field json.RawMessage
		if parser.Decode(&field) != nil {
			return nil
		}
		name, ok := token.(string)
		switch name {
		case "hook_event_name", "session_id", "turn_id", "tool_use_id", "source":
			if _, duplicate := fields[name]; duplicate || !ok {
				clear(field)
				return nil
			}
			var value string
			if json.Unmarshal(field, &value) != nil {
				clear(field)
				return nil
			}
			fields[name] = value
		}
		clear(field)
	}
	session, turn, tool := fields["session_id"], fields["turn_id"], fields["tool_use_id"]
	lifecycle := event == "SessionStart" || event == "SessionEnd"
	toolEvent := event == "PreToolUse" || event == "PostToolUse"
	if events[event] == "" || fields["hook_event_name"] != event || !validID(session) ||
		(!lifecycle && !validID(turn)) || (toolEvent && !validID(tool)) {
		return nil
	}
	if event == "SessionStart" && fields["source"] != "startup" && fields["source"] != "resume" && fields["source"] != "fork" {
		return nil
	}
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return nil
	}
	result := &observation{Workspace: workspace, Event: events[event], SentAt: at, Delivery: hex.EncodeToString(id),
		Session: pseudonym(key, "session", workspace, session)}
	if !lifecycle {
		value := pseudonym(key, "turn", session, turn)
		result.Turn = &value
	}
	if toolEvent {
		value := pseudonym(key, "tool", session, turn, tool)
		result.Tool = &value
	}
	return result
}

func pseudonym(key []byte, scope ...string) string {
	value, _ := json.Marshal(scope)
	defer clear(value)
	return hex.EncodeToString(mac(key, string(value)))
}

func mac(key []byte, domain string, parts ...[]byte) []byte {
	hash := hmac.New(sha256.New, key)
	hash.Write([]byte(domain))
	for _, part := range parts {
		hash.Write(part)
	}
	return hash.Sum(nil)
}

func deliver(port int, key []byte, workspace string, payload []byte, deadline time.Time) bool {
	if len(payload) > 1024 {
		return false
	}
	dial := net.Dialer{Deadline: deadline}
	connection, err := dial.Dial("tcp4", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		return false
	}
	defer connection.Close()
	if connection.SetDeadline(deadline) != nil {
		return false
	}
	var nonces [33]byte
	if _, err := io.ReadFull(connection, nonces[:16]); err != nil {
		return false
	}
	nonces[16] = workspace[0]
	if _, err := rand.Read(nonces[17:]); err != nil {
		return false
	}
	if _, err := connection.Write(nonces[16:]); err != nil {
		return false
	}
	var proof [32]byte
	if _, err := io.ReadFull(connection, proof[:]); err != nil || !hmac.Equal(proof[:], mac(key, serverDomain, nonces[:])) {
		return false
	}
	frame := binary.BigEndian.AppendUint16(nil, uint16(len(payload)))
	frame = append(frame, payload...)
	frame = append(frame, mac(key, clientDomain, nonces[:], frame)...)
	if _, err := connection.Write(frame); err != nil {
		return false
	}
	var ack [1]byte
	_, err = io.ReadFull(connection, ack[:])
	return err == nil && ack[0] == 1
}

func standardUser() bool {
	// Default excludes full elevated and UAC-filtered administrator tokens.
	const tokenElevationType = 18
	const tokenIsElevated = 20
	const tokenIntegrityLevel = 25
	const defaultElevationType = 1
	token, err := syscall.OpenCurrentProcessToken()
	if err != nil {
		return false
	}
	defer token.Close()
	var elevation, elevated, size uint32
	if err := syscall.GetTokenInformation(token, tokenElevationType, (*byte)(unsafe.Pointer(&elevation)), 4, &size); err != nil || elevation != defaultElevationType {
		return false
	}
	if err := syscall.GetTokenInformation(token, tokenIsElevated, (*byte)(unsafe.Pointer(&elevated)), 4, &size); err != nil || elevated != 0 {
		return false
	}
	integrity, err := readToken(token, tokenIntegrityLevel)
	if err != nil || len(integrity) < int(unsafe.Sizeof(syscall.SIDAndAttributes{})) {
		return false
	}
	label := (*syscall.SIDAndAttributes)(unsafe.Pointer(&integrity[0]))
	sid, err := label.Sid.String()
	rid, valid := strings.CutPrefix(sid, "S-1-16-")
	level, parseErr := strconv.ParseUint(rid, 10, 32)
	if err != nil || !valid || parseErr != nil || level > 8192 {
		return false
	}
	groups, err := tokenGroups(token)
	if err != nil {
		return false
	}
	for _, group := range groups {
		sid, err := group.Sid.String()
		if err != nil || sid == "S-1-5-32-544" {
			return false
		}
	}
	return true
}

func readToken(token syscall.Token, class uint32) ([]byte, error) {
	var size uint32
	syscall.GetTokenInformation(token, class, nil, 0, &size)
	if size == 0 || size > 64<<10 {
		return nil, os.ErrPermission
	}
	buffer := make([]byte, size)
	if err := syscall.GetTokenInformation(token, class, &buffer[0], size, &size); err != nil {
		return nil, err
	}
	return buffer[:size], nil
}

func tokenGroups(token syscall.Token) ([]syscall.SIDAndAttributes, error) {
	buffer, err := readToken(token, syscall.TokenGroups)
	if err != nil {
		return nil, err
	}
	type layout struct {
		count uint32
		first syscall.SIDAndAttributes
	}
	offset := int(unsafe.Offsetof(layout{}.first))
	if len(buffer) < offset {
		return nil, os.ErrPermission
	}
	groups := (*layout)(unsafe.Pointer(&buffer[0]))
	if int(groups.count) > (len(buffer)-offset)/int(unsafe.Sizeof(groups.first)) {
		return nil, os.ErrPermission
	}
	return unsafe.Slice(&groups.first, groups.count), nil
}
