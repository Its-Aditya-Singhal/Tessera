# Redaction (privacy layer)

Pure TypeScript, no browser APIs. Everything runs on the device.

```ts
import {
  RedactionSession,
  toggleItem,
  reviewRows,
  redactionSummary,
  pasteWarnings,
} from './redaction';

const session = new RedactionSession({ enabled: { IP: false } }); // settings page toggles
const result = session.redact(promptText); // result.text has [EMAIL_1], [PHONE_1], ...
const rows = reviewRows(result); // render one checkbox per row
const next = toggleItem(result, rows[0].id); // user unticks a row; next.text is re-rendered
redactionSummary(next); // "Redacted 2 email addresses and 1 API key"
session.restore(modelAnswer); // put originals back into the model's output
session.clear(); // forget the mapping when the flow is done
pasteWarnings(pastedText); // non-empty => show the passive banner
```

- `detect(text, options)` returns `{ type, span, confidence, detector }[]`, non-overlapping and in order.
- Placeholders are stable per session: the same value always maps to the same `[TYPE_n]`, and numbers already present literally in the text are skipped.
- The mapping lives only inside the `RedactionSession` object. It is never persisted, and `JSON.stringify(session)` returns only a count.
- Secret-like values are masked in review rows (`ghp_…xy`, `•••• 1111`) so screenshots don't capture them.

Detectors: `detectors/secrets.ts` (vendor keys, JWTs, private key blocks, `password=`/`secret=` values, high-entropy strings), `detectors/pii.ts` (email, phone, card with Luhn, IPv4/IPv6), `detectors/india.ts` (Aadhaar with Verhoeff, PAN, IFSC, UPI).

Benchmark: `eval/` builds a synthetic labeled set and scores it; results and method are in `docs/benchmarks/redaction.md`.
