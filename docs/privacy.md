# Privacy

Tessera is built so that your prompts and chats never leave your device.

## What Tessera stores

- **Settings only**, in `chrome.storage.local`: model tier, lifecycle mode, redaction switches,
  capsule preferences, token budgets and whether you agreed to a model download.
- **Nothing you type or read.** Prompts, optimizer results, captured conversations, handoff text and
  the placeholder mappings (which real value `[EMAIL_1]` stands for) live only in the memory of the
  open tab and are dropped when you close the panel or the tab.
- **Undo history** for Import lives in the tab's memory (the last 20 imports) and is gone when the
  tab closes.
- **Model weights**, if you choose to download a Tier 2 model, are cached by the browser like any
  other download. Chrome's built-in model is managed by Chrome.

**Settings → Clear all data** resets settings and wipes session state. Removing the extension removes
everything, including cached model weights.

## What Tessera sends

Nothing, to anyone. There are no Tessera servers, accounts, analytics or telemetry. The only network
requests the extension can make are:

- downloading Tier 2 model weights, and only after you agree in Settings;
- talking to a model server on `localhost` (Tier 3), and only after you grant that permission.

When you press **Open in …** during a handoff, Tessera opens the other chat site and places the text
in its chatbox. It never presses send. What you send to a chatbot is between you and that chatbot.

## Redaction

Before a prompt reaches any model, and before a handoff is placed anywhere, Tessera replaces secrets
and personal identifiers (API keys, tokens, passwords, card numbers, Aadhaar, PAN, UPI IDs, emails,
phone numbers, IFSC codes, IP addresses) with placeholders. You can review every item and switch
individual ones back. Detection runs on your device with rules; its measured precision and recall are
in [benchmarks/redaction.md](benchmarks/redaction.md). Rules miss things: always glance at the
preview.

## Untrusted content

Chat content is treated as data, never as instructions. The on-device model is never given tools,
and handoff text starts with a note telling the next assistant the same.

## Diagnostics

Diagnostics reports contain selectors, match counts, the site's origin and your browser version.
They contain no chat text and no conversation URL.
