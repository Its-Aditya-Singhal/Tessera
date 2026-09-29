// Ten conversation domains. Each is instantiated four times with different seeds,
// subsets of planted items and lengths, giving 40 conversations.

import { numberAccept, v, type DomainSpec } from './spec.ts';

const saasBilling: DomainSpec = {
  id: 'saas-billing',
  title: 'Subscription billing for a small SaaS app',
  opener: [
    "I'm adding subscription billing to my TypeScript SaaS app. Can you help me design it step by step?",
    'Sure. Let us pin down plans, trials, the data model and webhook handling, then write the core code.',
  ],
  facts: [
    {
      id: 'trial-days',
      question: 'How many days is the free trial we settled on?',
      value: (r) => String(r.pick([9, 11, 13, 17, 19, 23])),
      plant: (x) => [
        `Let's make the free trial ${x} days, not 14. Odd numbers stand out in the pricing page.`,
        `Got it: a ${x}-day trial. I'll use that constant everywhere.`,
      ],
    },
    {
      id: 'pro-price',
      question: 'What monthly price did we set for the Pro plan, in dollars?',
      value: (r) => String(r.int(23, 97)),
      plant: (x) => [
        `Pro plan will be $${x} per month.`,
        `Noted: Pro at $${x}/month, stored as ${Number(x) * 100} cents.`,
      ],
    },
    {
      id: 'staging-port',
      question: 'Which port does the billing service use on staging?',
      value: (r) => String(r.int(4100, 9800)),
      plant: (x) => [
        `On staging the billing service listens on port ${x}, since 3000 is taken by the web app.`,
        `Okay, staging billing on ${x}. I'll put it in the env template.`,
      ],
    },
    {
      id: 'webhook-retries',
      question: 'How many times do we retry a failed webhook before giving up?',
      value: (r) => String(r.int(4, 9)),
      plant: (x) => [
        `Cap webhook retries at ${x} attempts, then alert.`,
        `Right, ${x} attempts with backoff, then we page someone.`,
      ],
    },
    {
      id: 'invoice-prefix',
      question: 'What prefix do our invoice numbers use?',
      value: (r) => v.upper(r, 3),
      plant: (x) => [
        `Invoice numbers should start with the prefix ${x}, like ${x}-000123.`,
        `Sure, invoice ids will be ${x}- followed by a zero-padded sequence.`,
      ],
    },
    {
      id: 'grace-hours',
      question:
        'How many hours of grace period do we give after a failed payment before downgrading?',
      value: (r) => String(r.pick([30, 36, 42, 54, 60, 66])),
      plant: (x) => [
        `After a failed payment, give them ${x} hours of grace before downgrading.`,
        `Makes sense. ${x} hours, then the account drops to Free.`,
      ],
    },
  ],
  decisions: [
    {
      id: 'database',
      question: 'Which database did we decide to use for billing records?',
      options: ['PostgreSQL', 'MySQL', 'SQLite'],
      plant: (c, o) => [
        `For billing records, should we use ${c} or ${o}?`,
        `I'd go with ${c} here. We agreed: ${c} it is.`,
      ],
      revise: (f, t) => [
        `Change of plan: ops can't support ${f}. Let's switch billing records to ${t}.`,
        `Understood, we're moving from ${f} to ${t}. The schema carries over with minor type changes.`,
      ],
    },
    {
      id: 'money-type',
      question: 'How did we decide to store money amounts?',
      options: ['integer cents', 'decimal strings', 'bigint micros'],
      plant: (c, o) => [
        `Should amounts be ${c} or ${o}?`,
        `Decision: store money as ${c}. It avoids floating point errors.`,
      ],
      revise: (f, t) => [
        `Actually, the accountant wants ${t} instead of ${f}.`,
        `Fine, we switch from ${f} to ${t} for all amounts.`,
      ],
    },
    {
      id: 'proration',
      question: 'What did we decide about proration on plan upgrades?',
      options: ['prorate to the day', 'charge full price at next cycle', 'prorate to the hour'],
      plant: (c, o) => [`On upgrade, ${c} or ${o}?`, `We'll ${c}. That's the decision.`],
      revise: (f, t) => [
        `Support says "${f}" confuses people. Let's ${t} instead.`,
        `Agreed, upgrades now ${t} rather than ${f}.`,
      ],
    },
  ],
  code: [
    {
      id: 'prorate-fn',
      make: (r) => {
        const name = `prorate${v.name(r).replace(/^./, (c) => c.toUpperCase())}`;
        const min = r.int(37, 99);
        return {
          name,
          language: 'ts',
          code: `export function ${name}(cents: number, daysUsed: number, daysInCycle: number): number {\n  if (daysInCycle <= 0) throw new RangeError('daysInCycle must be positive');\n  const remaining = Math.max(0, daysInCycle - daysUsed);\n  const credit = Math.floor((cents * remaining) / daysInCycle);\n  return credit < ${min} ? 0 : credit; // ignore dust credits under ${min} cents\n}`,
        };
      },
      plant: (c, f) => [
        'Can you write the proration helper?',
        `Here it is:\n\n${f}\n\nCredits under the threshold are dropped so we don't issue tiny refunds.`,
      ],
      question: (c) =>
        `Paste the exact \`${c.name}\` function we wrote, unchanged, in a code block.`,
    },
    {
      id: 'plans-sql',
      make: (r) => {
        const table = `plans_${v.word(r)}`;
        return {
          name: table,
          language: 'sql',
          code: `CREATE TABLE ${table} (\n  id TEXT PRIMARY KEY,\n  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),\n  interval TEXT NOT NULL DEFAULT 'month',\n  seats INTEGER NOT NULL DEFAULT ${r.int(2, 9)}\n);`,
        };
      },
      plant: (c, f) => [
        'I wrote the plans table migration, does it look right?\n\n' + f,
        `Yes, \`${c.name}\` looks right. The CHECK constraint is a good guard.`,
      ],
      question: (c) =>
        `Give me the exact CREATE TABLE statement for \`${c.name}\` from earlier, unchanged.`,
    },
  ],
  filler: [
    [
      'How should I think about idempotency for webhooks?',
      'Store each event id and skip ones you have already processed. That makes retries safe.',
    ],
    [
      'Do I need to handle taxes now?',
      'Not for the first release. Keep a tax field on invoices so you can add it later without a migration.',
    ],
    [
      'What about customers who cancel mid-cycle?',
      'Let them keep access until the period ends, then downgrade. It is the least surprising behaviour.',
    ],
    [
      'Should the pricing page show annual plans?',
      'You can add annual later. Launch with monthly only to keep the first version simple.',
    ],
    [
      'How do I test this without real cards?',
      'Use the payment provider test mode and a fixture set of webhook payloads you replay locally.',
    ],
    ['Any logging advice?', 'Log event ids and invoice ids, never full card or personal data.'],
  ],
  closers: [
    [
      'Great, I think we have the basics.',
      'Nice. Next step is wiring the webhook handler into the router and writing a replay test.',
    ],
    [
      'Let me try this tomorrow.',
      'Sounds good. Start with the migration so the rest has something to write to.',
    ],
  ],
};

const dataPipeline: DomainSpec = {
  id: 'data-pipeline',
  title: 'Nightly Python data pipeline',
  opener: [
    'I need a nightly Python job that pulls sales exports, cleans them, and writes to our warehouse. Help me plan it?',
    'Happy to. We should settle the schedule, storage format, dedupe rules and alerting.',
  ],
  facts: [
    {
      id: 'batch-size',
      question: 'What batch size did we choose for warehouse inserts?',
      value: (r) => String(r.pick([1750, 2250, 3750, 4250, 6500, 7250])),
      accept: numberAccept,
      plant: (x) => [
        `Inserts time out above 8k rows. Use a batch size of ${x}.`,
        `Okay, batches of ${x} rows per insert.`,
      ],
    },
    {
      id: 'bucket',
      question: 'What is the name of the bucket the raw exports land in?',
      value: (r) => `raw-${v.word(r)}-${r.int(10, 99)}`,
      plant: (x) => [
        `Raw exports land in the bucket ${x}.`,
        `Got it, I'll read from ${x} and never write back to it.`,
      ],
    },
    {
      id: 'cron',
      question: 'At what time (UTC) does the nightly job run?',
      value: (r) => `${String(r.int(0, 5)).padStart(2, '0')}:${r.pick(['10', '25', '40', '55'])}`,
      plant: (x) => [
        `Schedule it at ${x} UTC, after the export finishes.`,
        `Scheduled for ${x} UTC every night.`,
      ],
    },
    {
      id: 'row-threshold',
      question: 'Below how many rows should the job alert that an export looks truncated?',
      value: (r) => String(r.int(120, 980)),
      plant: (x) => [
        `If an export has fewer than ${x} rows, something went wrong upstream.`,
        `I'll raise an alert when row count drops below ${x}.`,
      ],
    },
    {
      id: 'owner',
      question: 'Who is the on-call owner for pipeline alerts?',
      value: (r) => v.name(r).replace(/^./, (c) => c.toUpperCase()),
      plant: (x) => [`Alerts should go to ${x}; they own the warehouse.`, `Alerts routed to ${x}.`],
    },
  ],
  decisions: [
    {
      id: 'dataframe-lib',
      question: 'Which dataframe library did we decide to use?',
      options: ['polars', 'pandas', 'duckdb'],
      plant: (c, o) => [`${c} or ${o} for the transforms?`, `Let's go with ${c}. Decision made.`],
      revise: (f, t) => [
        `Our base image can't install ${f} cleanly. Switch to ${t}?`,
        `Yes, we'll use ${t} instead of ${f}. The transforms translate directly.`,
      ],
    },
    {
      id: 'storage-format',
      question: 'What file format did we pick for the cleaned staging files?',
      options: ['Parquet', 'CSV', 'JSON Lines'],
      plant: (c, o) => [`Staging files as ${c} or ${o}?`, `${c}. That's settled.`],
      revise: (f, t) => [
        `The analysts can't open ${f}. Can we use ${t}?`,
        `Sure, staging moves from ${f} to ${t}.`,
      ],
    },
    {
      id: 'orchestrator',
      question: 'What will orchestrate the job?',
      options: ['a plain cron container', 'Airflow', 'a GitHub Actions schedule'],
      plant: (c, o) => [
        `Should this run on ${c} or ${o}?`,
        `We'll use ${c}; it's enough for one job.`,
      ],
      revise: (f, t) => [
        `Platform team is retiring ${f}. Move to ${t}.`,
        `Okay, orchestration switches from ${f} to ${t}.`,
      ],
    },
  ],
  code: [
    {
      id: 'dedupe-fn',
      make: (r) => {
        const name = `dedupe_${v.word(r)}`;
        const key = r.pick(['order_id', 'invoice_no', 'txn_ref']);
        return {
          name,
          language: 'python',
          code: `def ${name}(rows: list[dict]) -> list[dict]:\n    seen: set[str] = set()\n    out = []\n    for row in sorted(rows, key=lambda r: r["updated_at"], reverse=True):\n        k = row["${key}"].strip().upper()\n        if k in seen:\n            continue\n        seen.add(k)\n        out.append(row)\n    return out`,
        };
      },
      plant: (c, f) => [
        'Write the dedupe step. Keep the newest row per key.',
        `Here's the function:\n\n${f}\n\nIt sorts newest first so the first occurrence wins.`,
      ],
      question: (c) => `Paste the exact \`${c.name}\` function from earlier, unchanged.`,
    },
    {
      id: 'job-config',
      make: (r) => {
        const name = `${v.word(r)}_job.yaml`;
        return {
          name,
          language: 'yaml',
          code: `job: nightly_sales\nretries: ${r.int(2, 6)}\ntimeout_minutes: ${r.int(25, 95)}\nnotify:\n  - channel: "#data-${v.word(r)}"\n    on: [failure, truncated]`,
        };
      },
      plant: (c, f) => [
        `Here's my ${c.name}:\n\n${f}`,
        'That config is fine. Retries and timeout look reasonable for a nightly job.',
      ],
      question: (c) => `Show me the exact contents of ${c.name} as I pasted it.`,
    },
  ],
  filler: [
    [
      'Should I validate the schema of each export?',
      'Yes, check column names and types first and fail fast with a clear message.',
    ],
    [
      'How do I handle timezones?',
      'Convert every timestamp to UTC at ingest and keep the original offset in a separate column.',
    ],
    [
      'Is it worth adding unit tests for a small job?',
      'Yes, test the transforms with tiny fixtures. They are where bugs hide.',
    ],
    [
      'What if the export is late?',
      'Poll for the file with a deadline, and alert if it never appears.',
    ],
    [
      'Should I keep old raw files?',
      'Keep them for a while with a lifecycle rule; they make backfills easy.',
    ],
    [
      'Any tips on logging?',
      'Log row counts at each stage. A sudden drop between stages is the fastest clue.',
    ],
  ],
  closers: [
    [
      'I think I have enough to build it.',
      'Great. Start with the reader and schema check, then add dedupe and the writer.',
    ],
    [
      'Thanks, this is clear.',
      'You are welcome. Run it once manually before trusting the schedule.',
    ],
  ],
};

const tripPlanning: DomainSpec = {
  id: 'trip-planning',
  title: 'Ten-day trip itinerary',
  opener: [
    "I'm planning a ten-day trip with two friends. Can you help me organise bookings and the route?",
    'Of course. Let us collect the bookings, budget and route decisions in one place.',
  ],
  facts: [
    {
      id: 'flight',
      question: 'What is our outbound flight number?',
      value: (r) => `${v.upper(r, 2)}${r.int(100, 989)}`,
      plant: (x) => [
        `Outbound flight is ${x}, leaving early morning.`,
        `Noted, flight ${x}. Plan to be at the airport two hours before.`,
      ],
    },
    {
      id: 'hotel-code',
      question: 'What is the confirmation code for the first hotel?',
      value: (r) => v.upper(r, 6),
      plant: (x) => [`First hotel confirmation code is ${x}.`, `Saved: confirmation ${x}.`],
    },
    {
      id: 'budget',
      question: 'What total budget per person did we agree on, in rupees?',
      value: (r) => v.money(r.int(60, 190) * 1000 + 500),
      accept: numberAccept,
      plant: (x) => [
        `Budget is ₹${x} per person, all in.`,
        `Okay, ₹${x} each including flights and stays.`,
      ],
    },
    {
      id: 'train-time',
      question: 'What time does the train between the two cities depart?',
      value: (r) => v.time(r),
      plant: (x) => [
        `The train between the cities leaves at ${x}.`,
        `Train at ${x}. I'd leave the hotel an hour earlier.`,
      ],
    },
    {
      id: 'return-date',
      question: 'What date do we fly back?',
      value: (r) => v.date(r),
      plant: (x) => [`We fly back on ${x}.`, `Return on ${x}, noted.`],
    },
  ],
  decisions: [
    {
      id: 'first-city',
      question: 'Which city did we decide to visit first?',
      options: ['Lisbon', 'Porto', 'Seville'],
      plant: (c, o) => [`Should we start in ${c} or ${o}?`, `Start in ${c}. Settled.`],
      revise: (f, t) => [
        `Flights into ${f} got expensive. Let's start in ${t} instead.`,
        `Agreed, we start in ${t}, not ${f}.`,
      ],
    },
    {
      id: 'stay-type',
      question: 'What kind of accommodation did we decide on for the second half?',
      options: ['a rented apartment', 'a hostel private room', 'a boutique hotel'],
      plant: (c, o) => [`Second half: ${c} or ${o}?`, `We'll book ${c}.`],
      revise: (f, t) => [
        `Everyone prefers ${t} over ${f} after all.`,
        `Okay, switching the second half from ${f} to ${t}.`,
      ],
    },
    {
      id: 'insurance',
      question: 'What did we decide about travel insurance?',
      options: ['buy a group policy', 'each person buys their own', 'skip insurance'],
      plant: (c, o) => [`Insurance: ${c} or ${o}?`, `Decision: ${c}.`],
      revise: (f, t) => [`Changed my mind on "${f}". Let's ${t}.`, `Fine, we now ${t}.`],
    },
  ],
  code: [
    {
      id: 'itinerary-json',
      make: (r) => {
        const name = `itinerary-${v.word(r)}.json`;
        return {
          name,
          language: 'json',
          code: `{\n  "days": ${r.int(9, 11)},\n  "travellers": ["${v.name(r)}", "${v.name(r)}", "${v.name(r)}"],\n  "splitCosts": true,\n  "currency": "EUR"\n}`,
        };
      },
      plant: (c, f) => [
        `I made ${c.name} for our shared app:\n\n${f}`,
        'Looks good. The shared app will import that without changes.',
      ],
      question: (c) => `Paste ${c.name} exactly as I wrote it.`,
    },
  ],
  filler: [
    [
      'Do we need visas?',
      'Check each traveller passport; many are visa free for short stays, but confirm on official sites.',
    ],
    ['How much cash should we carry?', 'A little for small cafes; cards work almost everywhere.'],
    ['Any tips for jet lag?', 'Get daylight on arrival and avoid long naps on day one.'],
    [
      'Should we book museums in advance?',
      'Yes for the popular ones; timed entries sell out in summer.',
    ],
    ['What about data plans?', 'An eSIM is usually cheapest for short trips.'],
    [
      'How do we split costs fairly?',
      'Log every shared expense in one app and settle up at the end.',
    ],
  ],
  closers: [
    [
      'Okay, I will share this with the group.',
      'Great. Ask them to confirm dates before you book anything non-refundable.',
    ],
    ['This is super helpful.', 'Glad it helps. Have a great trip.'],
  ],
};

const thesis: DomainSpec = {
  id: 'thesis',
  title: "Master's thesis planning",
  opener: [
    "I'm starting my master's thesis on remote-work productivity. Can you help me plan the structure and methods?",
    'Yes. Let us fix the constraints first, then methods and chapter plan.',
  ],
  facts: [
    {
      id: 'word-limit',
      question: 'What is the word limit for the thesis?',
      value: (r) => v.money(r.int(14, 29) * 1000 + r.pick([0, 500])),
      accept: numberAccept,
      plant: (x) => [
        `The word limit is ${x} words excluding appendices.`,
        `Okay, ${x} words. We'll budget chapters against that.`,
      ],
    },
    {
      id: 'deadline',
      question: 'When is the submission deadline?',
      value: (r) => v.date(r),
      plant: (x) => [
        `Submission deadline is ${x}.`,
        `Deadline ${x}. We'll work backwards from it.`,
      ],
    },
    {
      id: 'supervisor',
      question: "What is my supervisor's name?",
      value: (r) => v.person(r),
      plant: (x) => [
        `My supervisor is ${x}.`,
        `Noted, ${x} supervises. Worth sending them the outline early.`,
      ],
    },
    {
      id: 'sample-size',
      question: 'What sample size are we targeting?',
      value: (r) => String(r.int(83, 347)),
      plant: (x) => [
        `Power analysis says I need ${x} respondents.`,
        `Target sample of ${x}. Recruit about 20% more to cover dropouts.`,
      ],
    },
    {
      id: 'ethics-id',
      question: 'What is my ethics approval reference number?',
      value: (r) => v.code(r, 'ETH'),
      plant: (x) => [
        `Ethics approval came through: reference ${x}.`,
        `Great, cite ${x} in the methods chapter.`,
      ],
    },
  ],
  decisions: [
    {
      id: 'citation-style',
      question: 'Which citation style are we using?',
      options: ['APA 7', 'Harvard', 'Chicago author-date'],
      plant: (c, o) => [`${c} or ${o}?`, `Use ${c}. Decided.`],
      revise: (f, t) => [
        `The department just mandated ${t}, so not ${f}.`,
        `Understood, we switch from ${f} to ${t}.`,
      ],
    },
    {
      id: 'method',
      question: 'What primary research method did we choose?',
      options: ['an online survey', 'semi-structured interviews', 'a diary study'],
      plant: (c, o) => [`Should I do ${c} or ${o}?`, `Go with ${c}. That's the plan.`],
      revise: (f, t) => [
        `${f} won't work with my timeline. Let's do ${t}.`,
        `Okay, method changes from ${f} to ${t}.`,
      ],
    },
  ],
  code: [
    {
      id: 'r-analysis',
      make: (r) => {
        const name = `fit_${v.word(r)}`;
        return {
          name,
          language: 'r',
          code: `${name} <- function(df) {\n  df <- subset(df, hours_remote >= ${r.int(2, 9)})\n  model <- lm(productivity ~ hours_remote + tenure_years, data = df)\n  summary(model)\n}`,
        };
      },
      plant: (c, f) => [
        'Write the regression helper in R.',
        `Here you go:\n\n${f}\n\nThe filter drops people who barely work remotely.`,
      ],
      question: (c) => `Give me the exact R function \`${c.name}\` from before, unchanged.`,
    },
    {
      id: 'latex-table',
      make: (r) => {
        const name = `tab:${v.word(r)}`;
        return {
          name,
          language: 'latex',
          code: `\\begin{table}[h]\n\\centering\n\\begin{tabular}{lrr}\nGroup & N & Mean \\\\\nRemote & ${r.int(40, 99)} & ${r.int(60, 79)}.${r.int(1, 9)} \\\\\nOffice & ${r.int(40, 99)} & ${r.int(50, 69)}.${r.int(1, 9)} \\\\\n\\end{tabular}\n\\label{${name}}\n\\end{table}`,
        };
      },
      plant: (c, f) => [
        `Here's the pilot results table:\n\n${f}`,
        'The table compiles fine. Consider adding a caption.',
      ],
      question: (c) => `Paste the LaTeX table labelled ${c.name} exactly as I wrote it.`,
    },
  ],
  filler: [
    [
      'How long should the literature review be?',
      'Roughly a quarter of the word budget is common, but check your handbook.',
    ],
    [
      'Should I write the intro first?',
      'Write it last; it is easier once you know what you found.',
    ],
    [
      'How do I avoid scope creep?',
      'Write your research questions on one page and check every section against them.',
    ],
    [
      'What reference manager should I use?',
      'Any free one that exports to your citation style is fine.',
    ],
    [
      'How often should I meet my supervisor?',
      'Every two weeks with a short written update works well.',
    ],
  ],
  closers: [
    ['That gives me a plan.', 'Good. Draft the methods chapter first while the design is fresh.'],
    ['Thanks, talk later.', 'Good luck with the recruitment.'],
  ],
};

const rustCli: DomainSpec = {
  id: 'rust-cli',
  title: 'Rust command-line tool',
  opener: [
    "I'm building a small Rust CLI that deduplicates files in a folder. Help me design it?",
    'Sure. Let us decide the interface, limits and error handling, then write the core pieces.',
  ],
  facts: [
    {
      id: 'binary',
      question: 'What did we name the binary?',
      value: (r) => `${v.name(r)}dup`,
      plant: (x) => [`Call the binary ${x}.`, `Binary name ${x}. I'll set it in Cargo.toml.`],
    },
    {
      id: 'msrv',
      question: 'What minimum supported Rust version (MSRV) did we set?',
      value: (r) => `1.${r.int(74, 89)}`,
      plant: (x) => [`Set MSRV to ${x}.`, `MSRV ${x}, and CI will test it.`],
    },
    {
      id: 'max-size',
      question: 'What is the maximum file size the tool will hash, in MiB?',
      value: (r) => String(r.pick([384, 640, 768, 1536, 2560])),
      plant: (x) => [
        `Skip files larger than ${x} MiB.`,
        `Files over ${x} MiB are skipped with a warning.`,
      ],
    },
    {
      id: 'exit-code',
      question: 'What exit code does the tool return for invalid input?',
      value: (r) => String(r.int(3, 9) * 10 + r.int(1, 9)),
      plant: (x) => [
        `Invalid input should exit with code ${x}.`,
        `Exit code ${x} for invalid input, documented in the man page.`,
      ],
    },
    {
      id: 'config-path',
      question: 'What is the default config file path?',
      value: (r) => `~/.config/${v.word(r)}/rules.toml`,
      plant: (x) => [`Default config lives at ${x}.`, `Config path ${x}, overridable with a flag.`],
    },
  ],
  decisions: [
    {
      id: 'arg-parser',
      question: 'Which argument parsing crate did we choose?',
      options: ['clap', 'argh', 'lexopt'],
      plant: (c, o) => [`${c} or ${o} for arguments?`, `Use ${c}. Decided.`],
      revise: (f, t) => [
        `${f} adds too much to the binary size. Switch to ${t}.`,
        `Agreed, we replace ${f} with ${t}.`,
      ],
    },
    {
      id: 'hash',
      question: 'Which hash function did we decide to use for content comparison?',
      options: ['BLAKE3', 'xxHash', 'SHA-256'],
      plant: (c, o) => [`Hash with ${c} or ${o}?`, `${c}, final answer.`],
      revise: (f, t) => [
        `Benchmarks show ${t} is better for us than ${f}.`,
        `Then we switch hashing from ${f} to ${t}.`,
      ],
    },
    {
      id: 'licence',
      question: 'Which licence did we pick for the project?',
      options: ['MIT', 'Apache-2.0', 'MPL-2.0'],
      plant: (c, o) => [`Licence: ${c} or ${o}?`, `${c}. Done.`],
      revise: (f, t) => [
        `My employer prefers ${t} over ${f}.`,
        `Okay, relicensing from ${f} to ${t} before the first release.`,
      ],
    },
  ],
  code: [
    {
      id: 'parse-size',
      make: (r) => {
        const name = `parse_${v.word(r)}_size`;
        return {
          name,
          language: 'rust',
          code: `pub fn ${name}(s: &str) -> Option<u64> {\n    let s = s.trim();\n    let (num, mult) = match s.char_indices().find(|(_, c)| c.is_alphabetic()) {\n        Some((i, _)) => (&s[..i], match &s[i..] {\n            "K" => 1 << 10,\n            "M" => 1 << 20,\n            "G" => 1 << 30,\n            _ => return None,\n        }),\n        None => (s, 1),\n    };\n    num.parse::<u64>().ok().map(|n| n * mult).filter(|n| *n <= ${r.int(2, 9)} << 30)\n}`,
        };
      },
      plant: (c, f) => ['Write a size parser for flags like 512M.', `Here it is:\n\n${f}`],
      question: (c) => `Paste the exact \`${c.name}\` function, unchanged.`,
    },
  ],
  filler: [
    ['Should it follow symlinks?', 'Not by default. Add a flag, and guard against cycles.'],
    [
      'How do I show progress?',
      'A simple counter on stderr is enough; keep stdout for machine-readable output.',
    ],
    [
      'Delete duplicates or hard-link them?',
      'Default to a dry run that only reports. Make destructive actions explicit.',
    ],
    [
      'Parallelism?',
      'Hash in a thread pool, but read one file per disk at a time on spinning drives.',
    ],
    [
      'How should I test it?',
      'Create temp directories with known duplicates in integration tests.',
    ],
  ],
  closers: [
    [
      'Nice, I will start coding.',
      'Start with the walker and hashing; the CLI can wrap them later.',
    ],
    ['Thanks, that clears it up.', 'Happy to help. Share the repo when you have a first version.'],
  ],
};

const homeNetwork: DomainSpec = {
  id: 'home-network',
  title: 'Home network and NAS setup',
  opener: [
    "I'm redoing my home network with a NAS and a separate IoT network. Can you help me plan it?",
    'Yes. Let us fix the addressing, the wireless setup and the backup plan.',
  ],
  facts: [
    {
      id: 'subnet',
      question: 'What subnet did we choose for the main LAN?',
      value: (r) => `10.${r.int(20, 250)}.${r.int(1, 250)}.0/24`,
      plant: (x) => [
        `Main LAN will be ${x}.`,
        `${x} for the main LAN, avoiding the common 192.168 ranges.`,
      ],
    },
    {
      id: 'nas-ip',
      question: 'What static IP address does the NAS have?',
      value: (r) => `10.${r.int(20, 250)}.${r.int(1, 250)}.${r.int(2, 250)}`,
      plant: (x) => [`Give the NAS the static address ${x}.`, `NAS reserved at ${x}.`],
    },
    {
      id: 'ssid',
      question: 'What is the SSID of the IoT network?',
      value: (r) => `${v.word(r)}-iot-${r.int(10, 99)}`,
      plant: (x) => [`IoT SSID should be ${x}.`, `IoT network named ${x}, 2.4 GHz only.`],
    },
    {
      id: 'vlan',
      question: 'Which VLAN ID is the IoT network on?',
      value: (r) => String(r.int(11, 499)),
      plant: (x) => [`Put IoT on VLAN ${x}.`, `VLAN ${x} for IoT, blocked from the main LAN.`],
    },
    {
      id: 'backup-time',
      question: 'At what time does the nightly NAS backup run?',
      value: (r) => v.time(r),
      plant: (x) => [`Run the NAS backup nightly at ${x}.`, `Backups at ${x} each night.`],
    },
  ],
  decisions: [
    {
      id: 'wifi',
      question: 'How did we decide to cover the upstairs with Wi-Fi?',
      options: ['a wired access point', 'a mesh node', 'a powerline adapter'],
      plant: (c, o) => [`Upstairs coverage: ${c} or ${o}?`, `Go with ${c}.`],
      revise: (f, t) => [
        `Running cable for ${f} is impossible. Use ${t}.`,
        `Okay, upstairs gets ${t} instead of ${f}.`,
      ],
    },
    {
      id: 'dns',
      question: 'What did we decide to use for DNS?',
      options: ['a local Pi-hole', 'the router resolver', 'Unbound on the NAS'],
      plant: (c, o) => [`DNS: ${c} or ${o}?`, `Use ${c}. Decided.`],
      revise: (f, t) => [`${f} keeps breaking. Move DNS to ${t}.`, `Moving DNS from ${f} to ${t}.`],
    },
  ],
  code: [
    {
      id: 'nft-rule',
      make: (r) => {
        const name = `iot_${v.word(r)}`;
        return {
          name,
          language: 'bash',
          code: `nft add table inet ${name}\nnft add chain inet ${name} fwd '{ type filter hook forward priority 0; policy accept; }'\nnft add rule inet ${name} fwd iifname "vlan${r.int(11, 499)}" oifname "br-lan" drop`,
        };
      },
      plant: (c, f) => [
        'Write the firewall rule that stops IoT reaching the LAN.',
        `Run these:\n\n${f}`,
      ],
      question: (c) => `Paste the exact nft commands for the ${c.name} table, unchanged.`,
    },
    {
      id: 'rsync',
      make: (r) => {
        const name = `backup-${v.word(r)}.sh`;
        return {
          name,
          language: 'bash',
          code: `#!/bin/sh\nset -eu\nrsync -a --delete --exclude '.cache' /srv/${v.word(r)}/ /mnt/backup/\necho "backup ok $(date -u +%FT%TZ)" >> /var/log/${name}.log`,
        };
      },
      plant: (c, f) => [
        `My ${c.name}:\n\n${f}`,
        'That works. The set -eu will stop on the first error.',
      ],
      question: (c) => `Show me ${c.name} exactly as I pasted it.`,
    },
  ],
  filler: [
    ['Should I disable WPS?', 'Yes, turn it off.'],
    [
      'Is Wi-Fi 6E worth it?',
      'Only if your devices support it; otherwise it adds cost without benefit.',
    ],
    [
      'How do I update firmware safely?',
      'Back up the config first, and update during a quiet window.',
    ],
    [
      'Do I need a UPS for the NAS?',
      'A small one is worth it; power cuts during writes can corrupt data.',
    ],
    ['Guest network too?', 'Yes, isolated from both LAN and IoT.'],
  ],
  closers: [
    [
      'I will do this over the weekend.',
      'Do the addressing first, then move devices one group at a time.',
    ],
    ['Thanks!', 'Good luck with the rewiring.'],
  ],
};

const marketingLaunch: DomainSpec = {
  id: 'marketing-launch',
  title: 'Product launch marketing plan',
  opener: [
    'We launch our budgeting app soon. Can you help me put together the launch marketing plan?',
    'Sure. Let us fix dates, budget, channels and the offer.',
  ],
  facts: [
    {
      id: 'launch-date',
      question: 'What is the launch date?',
      value: (r) => v.date(r),
      plant: (x) => [`Launch day is ${x}.`, `${x} it is. We'll plan a two-week runway.`],
    },
    {
      id: 'discount',
      question: 'What discount code are we giving early users?',
      value: (r) => `${v.word(r).toUpperCase()}${r.int(10, 60)}`,
      plant: (x) => [
        `Early users get the code ${x}.`,
        `Code ${x}. I'll put it in the launch email.`,
      ],
    },
    {
      id: 'ad-budget',
      question: 'What is the total paid ad budget for launch, in dollars?',
      value: (r) => v.money(r.int(11, 94) * 100 + 50),
      accept: numberAccept,
      plant: (x) => [
        `Paid ads budget is $${x} total.`,
        `Okay, $${x} for paid ads across the launch.`,
      ],
    },
    {
      id: 'list-size',
      question: 'How many people are on our email waitlist?',
      value: (r) => v.money(r.int(1200, 9800)),
      accept: numberAccept,
      plant: (x) => [`The waitlist has ${x} people.`, `${x} is a solid list to start with.`],
    },
    {
      id: 'target-cpa',
      question: 'What target cost per acquisition did we set?',
      value: (r) => `$${r.int(3, 19)}.${r.int(10, 90)}`,
      accept: (x) => [x, x.slice(1)],
      plant: (x) => [`Target CPA is ${x}.`, `We'll pause any ad set above ${x} CPA.`],
    },
  ],
  decisions: [
    {
      id: 'primary-channel',
      question: 'Which channel did we decide to prioritise for launch?',
      options: ['the email waitlist', 'short-form video', 'community forums'],
      plant: (c, o) => [`Lead with ${c} or ${o}?`, `Prioritise ${c}.`],
      revise: (f, t) => [
        `Early tests on ${f} flopped. Lead with ${t}.`,
        `Switching our main channel from ${f} to ${t}.`,
      ],
    },
    {
      id: 'tier-names',
      question: 'What names did we pick for the two pricing tiers?',
      options: ['Starter and Plus', 'Basic and Pro', 'Solo and Household'],
      plant: (c, o) => [`Tier names: ${c} or ${o}?`, `${c}. Final.`],
      revise: (f, t) => [`Legal flagged ${f}. Use ${t}.`, `Okay, tiers renamed from ${f} to ${t}.`],
    },
  ],
  code: [
    {
      id: 'utm',
      make: (r) => {
        const name = `utm${v.name(r).replace(/^./, (c) => c.toUpperCase())}`;
        return {
          name,
          language: 'js',
          code: `function ${name}(url, source) {\n  const u = new URL(url);\n  u.searchParams.set('utm_source', source);\n  u.searchParams.set('utm_medium', 'launch');\n  u.searchParams.set('utm_campaign', 'wave${r.int(2, 9)}');\n  return u.toString();\n}`,
        };
      },
      plant: (c, f) => ['Write a helper to add UTM tags to links.', `Here:\n\n${f}`],
      question: (c) => `Paste the exact \`${c.name}\` function we wrote.`,
    },
  ],
  filler: [
    [
      'Should we do a launch on a community site too?',
      'Yes, but prepare answers to common questions before posting.',
    ],
    ['How many emails in the sequence?', 'Three: announcement, reminder, last chance.'],
    [
      'Do we need a press kit?',
      'A one-page kit with screenshots and a short founder bio is enough.',
    ],
    [
      'What metrics matter in week one?',
      'Activation rate and day-7 retention more than raw signups.',
    ],
    ['Influencers?', 'Micro creators in personal finance usually convert better than large ones.'],
  ],
  closers: [
    ['I will draft the emails next.', 'Great, keep each one short with one clear call to action.'],
    ['Thanks, this is a good plan.', 'Good luck with the launch.'],
  ],
};

const k8sDeploy: DomainSpec = {
  id: 'k8s-deploy',
  title: 'Kubernetes deployment for an API',
  opener: [
    'I need to deploy our Go API to Kubernetes. Can you help me get the manifests and rollout right?',
    'Yes. We should settle resources, health checks, tooling and rollout strategy.',
  ],
  facts: [
    {
      id: 'replicas',
      question: 'How many replicas does the API run in production?',
      value: (r) => String(r.int(3, 11)),
      plant: (x) => [`Run ${x} replicas in production.`, `${x} replicas, spread across zones.`],
    },
    {
      id: 'memory',
      question: 'What memory limit did we set for the API container?',
      value: (r) => `${r.pick([384, 448, 640, 704, 896, 1152])}Mi`,
      plant: (x) => [
        `Memory limit ${x}; it peaked well below that in load tests.`,
        `Limit set to ${x}.`,
      ],
    },
    {
      id: 'namespace',
      question: 'Which namespace does the API deploy to?',
      value: (r) => `api-${v.word(r)}`,
      plant: (x) => [`Deploy into the namespace ${x}.`, `Namespace ${x}.`],
    },
    {
      id: 'health-path',
      question: 'What path does the readiness probe hit?',
      value: (r) => `/${v.word(r)}/ready`,
      plant: (x) => [`Readiness endpoint is ${x}.`, `Probe will hit ${x}.`],
    },
    {
      id: 'image-tag',
      question: 'Which image tag are we deploying first?',
      value: (r) => `v${r.int(1, 4)}.${r.int(0, 19)}.${r.int(0, 9)}-${v.upper(r, 4).toLowerCase()}`,
      plant: (x) => [`First deploy uses image tag ${x}.`, `Tag ${x}, pinned in the manifest.`],
    },
  ],
  decisions: [
    {
      id: 'templating',
      question: 'Which manifest tool did we decide to use?',
      options: ['Kustomize', 'Helm', 'plain YAML'],
      plant: (c, o) => [`${c} or ${o}?`, `Use ${c}.`],
      revise: (f, t) => [
        `The platform team standardised on ${t}, so drop ${f}.`,
        `Understood, moving from ${f} to ${t}.`,
      ],
    },
    {
      id: 'rollout',
      question: 'What rollout strategy did we choose?',
      options: ['rolling update with maxUnavailable 0', 'blue-green', 'canary at 10 percent'],
      plant: (c, o) => [`Rollout: ${c} or ${o}?`, `We'll do ${c}.`],
      revise: (f, t) => [
        `${f} is too slow for us. Use ${t}.`,
        `Okay, rollout strategy changes from ${f} to ${t}.`,
      ],
    },
  ],
  code: [
    {
      id: 'deployment-yaml',
      make: (r) => {
        const name = `${v.word(r)}-api`;
        return {
          name,
          language: 'yaml',
          code: `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  revisionHistoryLimit: ${r.int(3, 12)}\n  selector:\n    matchLabels:\n      app: ${name}\n  template:\n    metadata:\n      labels:\n        app: ${name}\n    spec:\n      terminationGracePeriodSeconds: ${r.int(20, 75)}`,
        };
      },
      plant: (c, f) => ['Write the skeleton Deployment.', `Start from this:\n\n${f}`],
      question: (c) => `Paste the exact Deployment YAML for ${c.name}, unchanged.`,
    },
    {
      id: 'rollback',
      make: (r) => {
        const name = `rollback-${v.word(r)}.sh`;
        return {
          name,
          language: 'bash',
          code: `#!/usr/bin/env bash\nset -euo pipefail\nkubectl -n "$1" rollout undo deployment/"$2" --to-revision="\${3:-${r.int(1, 9)}}"\nkubectl -n "$1" rollout status deployment/"$2" --timeout=${r.int(60, 240)}s`,
        };
      },
      plant: (c, f) => [
        `Here's ${c.name}:\n\n${f}`,
        'Good, the status check makes the script wait for the rollback to finish.',
      ],
      question: (c) => `Show me ${c.name} exactly as I wrote it.`,
    },
  ],
  filler: [
    [
      'Do we need a PodDisruptionBudget?',
      'Yes, keep at least one pod available during node drains.',
    ],
    ['Liveness probe too?', 'Keep it lenient; an aggressive liveness probe causes restart loops.'],
    [
      'How do we handle secrets?',
      'Mount them from your secret store; never bake them into the image.',
    ],
    ['Autoscaling?', 'Add an HPA on CPU after you have a week of real traffic data.'],
    ['Logging?', 'Log JSON to stdout and let the cluster collect it.'],
  ],
  closers: [
    [
      'I will try a staging deploy first.',
      'Good idea. Watch the probe timings closely on the first rollout.',
    ],
    ['Thanks, that is everything.', 'Glad to help.'],
  ],
};

const catering: DomainSpec = {
  id: 'catering',
  title: 'Catering a family event',
  opener: [
    "I'm cooking for my parents' anniversary party. Help me plan the menu and logistics?",
    'Lovely. Let us fix numbers, dietary needs, the menu and timing.',
  ],
  facts: [
    {
      id: 'guests',
      question: 'How many guests are we cooking for?',
      value: (r) => String(r.int(27, 88)),
      plant: (x) => [
        `We're expecting ${x} guests.`,
        `${x} guests. I'll scale portions for that plus a small buffer.`,
      ],
    },
    {
      id: 'allergy',
      question: 'Which allergy do we need to cook around?',
      value: (r) => r.pick(['sesame', 'mustard', 'celery', 'lupin', 'sulphites']),
      plant: (x) => [
        `One guest has a severe ${x} allergy.`,
        `Then nothing with ${x}, and separate utensils.`,
      ],
    },
    {
      id: 'food-budget',
      question: 'What is the food budget in rupees?',
      value: (r) => v.money(r.int(18, 95) * 1000 + r.pick([250, 750])),
      accept: numberAccept,
      plant: (x) => [`Food budget is ₹${x}.`, `₹${x} works if we keep to one premium dish.`],
    },
    {
      id: 'serve-time',
      question: 'What time will dinner be served?',
      value: (r) => v.time(r),
      plant: (x) => [
        `Dinner is served at ${x}.`,
        `Serving at ${x}; start the main three hours before.`,
      ],
    },
    {
      id: 'oven-temp',
      question: 'At what oven temperature are we roasting the vegetables?',
      value: (r) => `${r.int(19, 23) * 10 + 5}°C`,
      accept: (x) => [x, x.replace('°C', '')],
      plant: (x) => [`My oven runs hot, so roast the vegetables at ${x}.`, `Roast at ${x} then.`],
    },
  ],
  decisions: [
    {
      id: 'main-dish',
      question: 'What main dish did we decide on?',
      options: ['paneer tikka masala', 'vegetable biryani', 'malai kofta'],
      plant: (c, o) => [`Main dish: ${c} or ${o}?`, `Make ${c}.`],
      revise: (f, t) => [
        `My mother wants ${t} instead of ${f}.`,
        `Of course, the main changes from ${f} to ${t}.`,
      ],
    },
    {
      id: 'service',
      question: 'How did we decide to serve the food?',
      options: ['a buffet', 'plated service', 'family-style platters'],
      plant: (c, o) => [`${c} or ${o}?`, `Go with ${c}.`],
      revise: (f, t) => [
        `The hall layout doesn't suit ${f}. Let's do ${t}.`,
        `Okay, switching from ${f} to ${t}.`,
      ],
    },
  ],
  code: [
    {
      id: 'scale-fn',
      make: (r) => {
        const name = `scale_${v.word(r)}`;
        return {
          name,
          language: 'python',
          code: `def ${name}(recipe: dict[str, float], base: int, guests: int) -> dict[str, float]:\n    factor = guests / base * ${1 + r.int(5, 15) / 100}\n    return {item: round(qty * factor, 1) for item, qty in recipe.items()}`,
        };
      },
      plant: (c, f) => [
        'Can you write me a tiny script to scale recipes?',
        `Sure:\n\n${f}\n\nThe multiplier adds a small buffer.`,
      ],
      question: (c) => `Paste the exact \`${c.name}\` function from earlier.`,
    },
  ],
  filler: [
    ['How far ahead can I cook the gravy?', 'A day ahead is fine; it often tastes better.'],
    ['How much rice per person?', 'About 75 grams uncooked per person for a mixed menu.'],
    ['Dessert?', 'Something you can make the day before, like kheer, reduces stress.'],
    ['Should I hire help?', 'One helper for serving and cleanup makes a big difference.'],
    ['How do I keep food warm?', 'Chafing dishes or a low oven around 80°C.'],
  ],
  closers: [
    ['I think we are set.', 'Great. Make a timeline for the day and share it with your helper.'],
    ['Thank you so much.', 'Enjoy the celebration.'],
  ],
};

const personalFinance: DomainSpec = {
  id: 'personal-finance',
  title: 'Personal finance plan',
  opener: [
    'Can you help me set up a simple personal finance plan? I just got my first full-time job.',
    'Of course. Let us cover the emergency fund, investing, loans and taxes.',
  ],
  facts: [
    {
      id: 'sip',
      question: 'How much is my monthly SIP amount in rupees?',
      value: (r) => v.money(r.int(3, 29) * 1000 + r.pick([0, 500])),
      accept: numberAccept,
      plant: (x) => [`I can invest ₹${x} a month through a SIP.`, `Great, a ₹${x} monthly SIP.`],
    },
    {
      id: 'emergency',
      question: 'What emergency fund target did we set, in rupees?',
      value: (r) => v.money(r.int(1, 9) * 100000 + r.int(1, 9) * 10000),
      accept: numberAccept,
      plant: (x) => [
        `Let's target ₹${x} for the emergency fund.`,
        `₹${x} covers about six months of expenses. Good target.`,
      ],
    },
    {
      id: 'loan-rate',
      question: 'What interest rate is my education loan at?',
      value: (r) => `${r.int(8, 12)}.${r.int(1, 9)}%`,
      accept: (x) => [x, x.replace('%', ' percent')],
      plant: (x) => [
        `My education loan is at ${x}.`,
        `At ${x}, prepaying the loan is worth considering.`,
      ],
    },
    {
      id: 'emi-day',
      question: 'On which day of the month is the loan EMI debited?',
      value: (r) => String(r.int(2, 27)),
      accept: (x) => [x, `${x}th`, `${x}st`, `${x}nd`, `${x}rd`],
      plant: (x) => [
        `The EMI is debited on day ${x} of every month.`,
        `Then keep enough in the account by day ${x}.`,
      ],
    },
  ],
  decisions: [
    {
      id: 'tax-regime',
      question: 'Which income tax regime did we decide to opt for?',
      options: ['the new regime', 'the old regime'],
      plant: (c, o) => [`${c} or ${o}?`, `Opt for ${c}.`],
      revise: (f, t) => [
        `With my rent receipts, ${t} saves more than ${f}.`,
        `Right, then switch from ${f} to ${t}.`,
      ],
    },
    {
      id: 'fund',
      question: 'What kind of fund did we choose for the SIP?',
      options: ['a Nifty 50 index fund', 'a flexi-cap fund', 'a Nifty Next 50 index fund'],
      plant: (c, o) => [`${c} or ${o}?`, `Start with ${c}.`],
      revise: (f, t) => [
        `I read more; I'd rather use ${t} than ${f}.`,
        `Fine, the SIP goes into ${t} instead of ${f}.`,
      ],
    },
  ],
  code: [
    {
      id: 'emi-formula',
      make: (r) => {
        const name = `emi_${v.word(r)}`;
        return {
          name,
          language: 'python',
          code: `def ${name}(principal: float, annual_rate: float, months: int) -> float:\n    r = annual_rate / 12 / 100\n    if r == 0:\n        return round(principal / months, 2)\n    return round(principal * r * (1 + r) ** months / ((1 + r) ** months - 1), ${r.int(0, 3)})`,
        };
      },
      plant: (c, f) => ['Write an EMI calculator for me.', `Here you go:\n\n${f}`],
      question: (c) => `Paste the exact \`${c.name}\` function you wrote.`,
    },
  ],
  filler: [
    [
      'Should I get term insurance now?',
      'If anyone depends on your income, yes; it is cheapest when you are young.',
    ],
    ['Credit card?', 'One card paid in full every month builds credit history.'],
    ['Gold?', 'Optional and small; it is not a substitute for equity or an emergency fund.'],
    ['How often should I review this?', 'Once or twice a year, or after a big life change.'],
    [
      'Health insurance through work enough?',
      'Consider a small personal policy too, since work cover ends if you switch jobs.',
    ],
  ],
  closers: [
    [
      'This is a good start.',
      'Great. Automate the SIP and the emergency fund transfer so it happens without effort.',
    ],
    ['Thanks a lot.', 'You are welcome. Good luck with the new job.'],
  ],
};

export const DOMAINS: readonly DomainSpec[] = [
  saasBilling,
  dataPipeline,
  tripPlanning,
  thesis,
  rustCli,
  homeNetwork,
  marketingLaunch,
  k8sDeploy,
  catering,
  personalFinance,
];
