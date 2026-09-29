# Permissions

Tessera asks for as little as possible. Every entry in the manifest is listed here with the reason.

| Manifest entry                            | Value                                                                                                      | Why                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_scripts.matches`                 | `https://chatgpt.com/*`, `https://chat.openai.com/*`, `https://claude.ai/*`, `https://gemini.google.com/*` | Reads and writes the chatbox and reads the conversation on the supported sites. This is Tessera's only host access; Chrome shows it as "Read and change your data on" those sites. `chat.openai.com` is kept because older links still redirect through it. |
| `permissions: offscreen`                  |                                                                                                            | Hosts the optional on-device model in an offscreen document, because Manifest V3 service workers are suspended when idle.                                                                                                                                   |
| `optional_host_permissions`               | `http://localhost/*`, `http://127.0.0.1/*`                                                                 | Only for Tier 3 (a local model server such as Ollama). Requested at runtime when you turn that tier on, never at install.                                                                                                                                   |
| `commands`                                | `toggle-panel`, suggested `Alt+Shift+O`                                                                    | Keyboard shortcut to open the panel. Change it at `chrome://extensions/shortcuts`. Not a permission.                                                                                                                                                        |
| `action`                                  |                                                                                                            | The toolbar button toggles the panel on a supported site. Not a permission.                                                                                                                                                                                 |
| `content_security_policy.extension_pages` | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`                                                 | WebLLM compiles WebAssembly. No remote scripts are allowed.                                                                                                                                                                                                 |

Planned additions, each to be justified here when it lands:

- `storage` (M2) for settings only. Prompts, chats and redaction mappings are never stored.
- `idle` and `alarms` (M2) so the lifecycle manager can unload the model when the machine locks and
  keep timers that survive service worker suspension.

## Network

The extension makes no network requests of its own except, after you explicitly agree, downloading
model weights for Tier 2 from `huggingface.co` and the model's compiled code from
`raw.githubusercontent.com` (both via WebLLM). The diagnostics page's WebLLM spike asks for the same
consent. Chrome's built-in model (Tier 1) is downloaded by Chrome itself.

No analytics, telemetry, accounts or servers.
