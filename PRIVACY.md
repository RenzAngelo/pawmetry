# Privacy

Pawmetry stores appearance, sizing, positioning, and shortcut preferences locally. In the bundled extension, the start prompt asks to read live quota. After confirmation, future starts from VS Code can connect automatically. Turning off quota access in **Settings → Connections** stops requests and saves that choice. The standalone preview asks for opt-in each run. Pawmetry keeps normalized remaining percentages, quota windows, reset times, and temporary account-scope correlation in memory. It does not save quota history.

The installed Codex App Server manages its own authentication and connects to OpenAI to return account quota. Pawmetry neither reads provider authentication files nor retains account identifiers in raw form. It does not collect prompts, transcripts, source code, tool arguments, or provider credentials. Simulation makes no provider requests.

The VS Code extension exchanges quota and fixed control requests with the local companion. A short-lived local IPC key is stored in a logon-restricted descriptor and is unrelated to the user's provider credentials. Pawmetry has no analytics, hosted backend, advertising or usage reporting. Codex, VS Code and Windows have their own privacy settings.

To remove Pawmetry preferences, close the companion and remove its settings as described in the [installation guide](INSTALLATION.md).
