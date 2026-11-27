# Security

## Preview boundaries

The bundled extension asks for live quota consent before first launch or restart into an updated build. Later starts remember the choice, and an explicit desktop opt-out keeps quota access off. The standalone build asks for opt-in each run. The desktop makes a fixed stdio exchange with an isolated Codex App Server, using an eligible executable from the local OpenAI VS Code extension. Executable discovery checks the extension manifest and rejects ambiguous or redirected paths. It never searches the current project or PATH for the runtime. The child uses a fixed argument vector, no shell, a transient working directory, bounded responses, timeouts and a minimal environment. Provider stderr and non-quota data are discarded. [App Server authentication](https://learn.chatgpt.com/docs/app-server#authentication-modes)

Renderer windows load local assets with a restrictive content security policy, context isolation, sandboxing, disabled Node integration and disabled DevTools. The main process validates the exact sending renderer, main frame, action and bounded inputs. The packaged Windows runtime disables RunAsNode, Node environment options, Node CLI inspection and Chromium remote debugging switches. The default Electron application is removed. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) · [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)

The companion binds IPv4 loopback only. IPC version 2 authenticates both peers with fresh nonces and a rotating per-process capability. A validated descriptor in Local AppData uses a DACL restricted to the current Windows logon SID. The protocol accepts one bounded request per connection for quota status, refresh or an enumerated desktop control. It provides no event publisher, shell or enrollment route. A restart invalidates the old listener and rotates the capability. A stale descriptor can be replaced after its previous listener fails authentication. [Windows logon SID isolation](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)

## Remaining limits

- The single-install extension starts only the fixed executable under its own extension directory after an explicit command in trusted local Windows x64 VS Code. It checks the executable digest recorded by the package, rejects redirected launch targets, and uses a reduced child environment without shell execution. The package and DLLs still rely on the installed extension and same-user trust boundary. Updates use an authenticated companion build identity and an explicit restart confirmation. The preview includes no background updater or activity hooks.

- Processes already running as the same Windows user can interfere with the local application and its files. An administrator can also change them. A separate real Windows logon test remains pending.
- The portable package is unsigned. Artifact checksums identify the reviewed package bytes. Distribution identity and policy enforcement depend on the download channel and Windows configuration.
- Automated runtime tests cover a non-elevated administrator-linked Windows token. The maintainer reported a successful v0.1.5 VSIX install and launch on a standard Windows account with no warning. Windows policy can vary by system. [Manual acceptance](MANUAL_TESTS.md#single-install-preview)
- Pawmetry has no updater and uses the installed Codex extension. Review each candidate for Electron security fixes and repeat compatibility checks if the provider changes its interface.
- Native activity enrollment and the experimental helper are excluded from both archives. The experiment remains on a separate development branch.

See the [privacy statement](PRIVACY.md) for stored data and [installation guide](INSTALLATION.md) for cleanup and Windows security warnings.

## Report a vulnerability

Use **Security → Report a vulnerability** once private reporting is enabled in the public repository. Until then, use the private contact provided with a beta build. Include the build ID, impact, and a synthetic reproduction. Keep credentials, provider payloads and personal project details out of reports.
