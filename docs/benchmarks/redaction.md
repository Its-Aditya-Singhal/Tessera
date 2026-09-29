# Redaction benchmark

Precision and recall of the privacy layer's local detectors (`packages/core/src/redaction`) on a labeled, **synthetic-only** test set.

Regenerate with:

```sh
npx tsx packages/core/scripts/redaction-report.ts
```

That rewrites the results section below and `redaction.json` next to this file. The same numbers are guarded by `packages/core/src/redaction/eval/benchmark.test.ts`, which fails if any category drops below its floor.

## Read this first: what these numbers are and are not

- **Synthetic, author-written data.** The generators and the detectors were written by the same author, and the detectors were tuned on the "tuning set" below. These numbers are an upper bound. Real chats will contain formats nobody thought to generate, and precision and recall there will be lower. A second, independently written set (ideally by someone who has not read the detectors) is the right next step.
- The "fresh draw" run uses the same templates with a different random seed. It shows the results do not depend on one lucky draw; it is **not** a held-out test of new phrasing.
- No real identifiers are used. Numbers come from a seeded PRNG and are given valid Luhn or Verhoeff check digits where the format needs one. Emails use reserved `example.*` domains, IPv4 addresses come from RFC 5737 documentation ranges and private ranges, IPv6 from `2001:db8::/32` (RFC 3849). Credentials are random strings with the right prefix and length, generated at run time so no credential-shaped literal is committed.

## Method

- **Samples.** Each sample is one short chat-style message (English, some Hinglish) with zero or more labeled spans. Positive generators cover every category and several formats per category (for example `+91 98765 43210`, `+91-9876543210`, `09876543210`, bare 10 digits with and without a word like "mobile" nearby, landlines, UK/US/DE/UAE numbers). Hard negatives are text that looks sensitive but is not: git SHAs, UUIDs, hashes, npm integrity strings, version numbers, Unix timestamps, 10 and 12 digit order numbers, non-Luhn 16 digit numbers, ISBNs, bank account numbers, long identifiers, file paths, URLs, `password = os.environ[...]`, type annotations, prose like "Enter your password: then…", SSH remotes (`git@github.com:…`), `user@host`, C++ scopes, MAC addresses, loopback addresses and the AWS documentation sample key.
- **Matching.** A prediction counts as a true positive when it has the same category as a gold span and they overlap by at least half of their union, one-to-one. Anything else predicted is a false positive; any gold span left over is a false negative. `ANY` ignores the category: it asks whether each sensitive span got redacted by something, and whether each redaction covered something sensitive.
- **Threshold.** Default settings (`minConfidence` 0.5, every category on), which is what the extension uses.
- **Labeling policy.** The span is the value only (for `password=…` only what follows `=`). Loopback, unspecified and broadcast addresses (`127.0.0.1`, `0.0.0.0`, `255.255.255.255`) are not sensitive and are not labeled.

## Tuning history

The first version of the set had only the obvious hard negatives, and every category scored close to 100%, which said more about the set than the detectors. Adding negatives the detectors had not been designed around (seed 20260929, before fixes) gave:

| Category | Precision % | Recall % | What went wrong |
|---|---:|---:|---|
| API_KEY | 91.8 | 100.0 | AWS's documented sample key `AKIA…EXAMPLE` flagged (16 FP) |
| SECRET | 76.9 | 83.3 | npm/SRI `sha512-…` integrity hashes flagged as high entropy (15 FP) |
| PHONE | 99.4 | 100.0 | 10 digits inside an MD5 hex string flagged as an Indian mobile (1 FP) |
| PAN | 100.0 | 90.8 | lowercase PANs typed in chat missed (11 FN) |
| ANY | 97.4 | 97.1 | 32 of 640 negative samples got at least one redaction |

Fixes: ignore keys ending in `EXAMPLE`; skip `sha256-/sha384-/sha512-` integrity strings; require number detectors to sit on word boundaries (not inside hex or identifiers); accept lowercase PANs only when "pan" appears nearby. After that no negative sample is redacted.

The seed-7 draw then found one more miss: a password starting with `%` was being skipped as a template. Template detection now only skips clear templates (`%(name)s`, `%NAME%`, `${…}`, `$NAME`, `{{…}}`, `<…>`).

## Known gaps, on purpose

- **Unseparated 12-digit numbers with no Aadhaar context.** One in ten random 12-digit numbers passes Verhoeff, so a bare `474396405045` in "ref 474396405045 for the KYC form" gets confidence 0.45, below the default 0.5, and is not redacted. With a space/dash grouping or a word like "Aadhaar"/"UID" nearby it is. This is the whole Aadhaar recall gap below. Users who want it can lower the threshold.
- **Free-standing pure hex secrets.** A 40-character hex key with nothing around it looks exactly like a git SHA or a file hash, which are everywhere in coding chats. It is caught when assigned to a secret-looking name (`api_key: "…"`, `CLIENT_SECRET=…`, `?access_token=…`) and missed otherwise. This is the whole SECRET recall gap below.
- **Not detected at all:** names, postal addresses, dates of birth, bank account numbers, passport and voter ID numbers, and credentials with vendor prefixes not in the list (the generic high-entropy detector catches many of them).

## Results

<!-- results:start (generated by packages/core/scripts/redaction-report.ts, do not edit by hand) -->

### Tuning set (seed 20260929)

1570 samples: 930 with at least one sensitive span, 640 hard negatives. Negative samples with any redaction: 0.

| Category | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| PRIVATE_KEY | 30 | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| API_KEY | 180 | 180 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| TOKEN | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| SECRET | 60 | 50 | 0 | 10 | 100.0 | 83.3 | 90.9 |
| CARD | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| AADHAAR | 60 | 45 | 0 | 15 | 100.0 | 75.0 | 85.7 |
| EMAIL | 132 | 132 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 180 | 180 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IP | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ANY | 1242 | 1217 | 0 | 25 | 100.0 | 98.0 | 99.0 |

Groups below 100% recall:

| Group | Support | Recall % |
|---|---:|---:|
| AADHAAR compact-nocontext | 15 | 0.0 |
| SECRET hex-free-standing | 10 | 0.0 |

### Fresh draw (seed 7)

1570 samples: 930 with at least one sensitive span, 640 hard negatives. Negative samples with any redaction: 0.

| Category | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| PRIVATE_KEY | 30 | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| API_KEY | 180 | 180 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| TOKEN | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| SECRET | 60 | 50 | 0 | 10 | 100.0 | 83.3 | 90.9 |
| CARD | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| AADHAAR | 60 | 45 | 0 | 15 | 100.0 | 75.0 | 85.7 |
| EMAIL | 128 | 128 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 60 | 60 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 180 | 180 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IP | 120 | 120 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ANY | 1238 | 1213 | 0 | 25 | 100.0 | 98.0 | 99.0 |

Groups below 100% recall:

| Group | Support | Recall % |
|---|---:|---:|
| AADHAAR compact-nocontext | 15 | 0.0 |
| SECRET hex-free-standing | 10 | 0.0 |

<!-- results:end -->
