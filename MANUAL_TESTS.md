# Pending manual validation

Record versions and pass, fail or unavailable for each row. Use disposable workspaces and retain only sanitized evidence. The Windows computer-use skill prohibits automating the Codex extension UI. The maintainer deferred these checks for a consolidated QA pass.

| Check | Procedure | Acceptance |
| --- | --- | --- |
| Quota conversation continuity | Use two disposable VS Code workspaces with Codex conversations under the same provider account and workspace. Run `npm.cmd run --silent quota:probe` from a separate terminal. Check both chats afterward. Repeat once with one window minimized, then restore it | Existing conversations stay usable without a reload or sign-in prompt. Report provider workspace confirmation separately if available. No new prompt is required |
| Native activity delivery and trust | Use only disposable trusted projects with the documented hook configuration and normal Codex hook review. Test an untrusted hook, an approved hook, and removal. Exercise a benign tool action with VS Code visible and minimized and compare the observation to the UI | Events appear only for approved, supported behavior. Existing tool behavior is preserved and projected output contains no input, transcript, tool output or raw identifiers |
| Concurrent activity | Start overlapping benign tool actions from two disposable projects in separate VS Code windows | The activity probe distinguishes both sessions, and a stale or disconnected session cannot change the other session's state |
