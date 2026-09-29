/**
 * Labeled redaction test set built from SYNTHETIC data only.
 *
 * Nothing here is a real identifier: numbers are drawn from a seeded PRNG and
 * given valid checksums where the format has one, emails use reserved
 * `example.*` domains, IPs come from documentation ranges (RFC 5737 / 3849)
 * and private ranges, and credentials are random strings with the right
 * prefix and shape. They are generated at run time rather than committed so
 * no credential-shaped literal ever lands in the repository.
 */
import { luhnCheckDigit, verhoeffCheckDigit } from '../checksums';
import type { DetectionType } from '../types';

export interface GoldLabel {
  type: DetectionType;
  start: number;
  end: number;
}

export interface Sample {
  id: string;
  /** Which bucket the sample came from, e.g. `PHONE/in-bare-context` or `negative/git-sha`. */
  group: string;
  text: string;
  labels: GoldLabel[];
}

export const DEFAULT_SEED = 20260929;

// ------------------------------------------------------------------ PRNG helpers

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  chars(alphabet: string, n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(this.next() * alphabet.length)];
    return s;
  }
  digits(n: number): string {
    return this.chars('0123456789', n);
  }
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALNUM = UPPER + LOWER + DIGITS;
const B64URL = ALNUM + '-_';
const HEX = '0123456789abcdef';

function b64url(s: string): string {
  // ASCII-only input, so btoa is enough and keeps this file free of Node APIs.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ------------------------------------------------------------------ sample builder

type Part = string | { type: DetectionType; value: string } | { unlabeled: string };

function build(id: string, group: string, parts: Part[]): Sample {
  let text = '';
  const labels: GoldLabel[] = [];
  for (const p of parts) {
    if (typeof p === 'string') text += p;
    else if ('unlabeled' in p) text += p.unlabeled;
    else {
      labels.push({ type: p.type, start: text.length, end: text.length + p.value.length });
      text += p.value;
    }
  }
  return { id, group, text, labels };
}

const FIRST = ['aarav', 'priya', 'rohan', 'ananya', 'vikram', 'meera', 'arjun', 'kavya', 'sam', 'lee', 'maria', 'chen', 'fatima', 'olu', 'ines'];
const LAST = ['sharma', 'iyer', 'patel', 'reddy', 'nair', 'singh', 'khan', 'das', 'smith', 'garcia', 'okafor', 'wong'];

// ------------------------------------------------------------------ value generators

function email(r: Rng): string {
  const local = r.pick([
    () => `${r.pick(FIRST)}.${r.pick(LAST)}`,
    () => `${r.pick(FIRST)}${r.int(1, 999)}`,
    () => `${r.pick(FIRST)}_${r.pick(LAST)}+${r.pick(['news', 'work', 'test'])}`,
    () => `${r.pick(FIRST)[0]}${r.pick(LAST)}`,
  ])();
  const domain = r.pick(['example.com', 'example.org', 'example.net', 'mail.example.co.in', 'corp.example.in', 'example.io']);
  return `${local}@${domain}`;
}

function inMobile10(r: Rng): string {
  return String(r.int(6, 9)) + r.digits(9);
}

function phone(r: Rng): { value: string; group: string; context: boolean } {
  const m = inMobile10(r);
  return r.pick([
    () => ({ value: `+91 ${m.slice(0, 5)} ${m.slice(5)}`, group: 'in-plus91-spaced', context: false }),
    () => ({ value: `+91-${m}`, group: 'in-plus91-dash', context: false }),
    () => ({ value: `+91${m}`, group: 'in-plus91-compact', context: false }),
    () => ({ value: `0${m}`, group: 'in-trunk0', context: false }),
    () => ({ value: `${m.slice(0, 3)}-${m.slice(3, 6)}-${m.slice(6)}`, group: 'in-3-3-4', context: false }),
    () => ({ value: m, group: 'in-bare-context', context: true }),
    () => ({ value: m, group: 'in-bare-nocontext', context: false }),
    () => ({ value: `0${r.pick(['22', '80', '11', '44', '40'])}-${r.int(2, 6)}${r.digits(3)} ${r.digits(4)}`, group: 'in-landline', context: true }),
    () => ({ value: `+44 20 7946 0${r.digits(3)}`, group: 'intl-uk', context: false }),
    () => ({ value: `+1 (${r.int(201, 989)}) 555-01${r.digits(2)}`, group: 'intl-us', context: false }),
    () => ({ value: `+49 30 ${r.digits(4)} ${r.digits(4)}`, group: 'intl-de', context: false }),
    () => ({ value: `+971 50 ${r.digits(3)} ${r.digits(4)}`, group: 'intl-ae', context: false }),
    () => ({ value: `(${r.int(201, 989)}) 555-01${r.digits(2)}`, group: 'nanp-parens', context: false }),
    () => ({ value: `${r.int(201, 989)}-555-01${r.digits(2)}`, group: 'nanp-dash', context: false }),
  ])();
}

function cardNumber(r: Rng): { value: string; group: string } {
  const brand = r.pick([
    { name: 'visa', prefix: '4', len: 16 },
    { name: 'mastercard', prefix: String(r.int(51, 55)), len: 16 },
    { name: 'mastercard-2', prefix: String(r.int(2221, 2720)), len: 16 },
    { name: 'amex', prefix: r.pick(['34', '37']), len: 15 },
    { name: 'rupay', prefix: r.pick(['60', '6521', '6522', '508']), len: 16 },
    { name: 'discover', prefix: '6011', len: 16 },
    { name: 'jcb', prefix: '35' + String(r.int(28, 89)), len: 16 },
  ]);
  const payload = brand.prefix + r.digits(brand.len - brand.prefix.length - 1);
  const d = payload + luhnCheckDigit(payload);
  const sep = r.pick(['', ' ', '-']);
  let value: string;
  if (brand.len === 15) value = [d.slice(0, 4), d.slice(4, 10), d.slice(10)].join(sep);
  else value = (d.match(/.{4}/g) ?? []).join(sep);
  return { value, group: `${brand.name}${sep === '' ? '-compact' : '-grouped'}` };
}

function ipAddress(r: Rng): { value: string; group: string } {
  return r.pick([
    () => ({ value: `192.0.2.${r.int(1, 254)}`, group: 'v4-doc' }),
    () => ({ value: `198.51.100.${r.int(1, 254)}`, group: 'v4-doc' }),
    () => ({ value: `203.0.113.${r.int(1, 254)}`, group: 'v4-doc' }),
    () => ({ value: `10.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, group: 'v4-private' }),
    () => ({ value: `192.168.${r.int(0, 255)}.${r.int(1, 254)}`, group: 'v4-private' }),
    () => ({ value: `2001:db8:${r.chars(HEX, 4)}:${r.chars(HEX, 4)}::${r.int(1, 999)}`, group: 'v6-compressed' }),
    () => ({ value: `2001:0db8:${Array.from({ length: 6 }, () => r.chars(HEX, 4)).join(':')}`, group: 'v6-full' }),
  ])();
}

function aadhaar(r: Rng): string {
  const payload = String(r.int(2, 9)) + r.digits(10);
  return payload + verhoeffCheckDigit(payload);
}

function pan(r: Rng): string {
  return r.chars(UPPER, 3) + r.pick(['P', 'P', 'P', 'C', 'H', 'F', 'T']) + r.chars(UPPER, 1) + r.digits(4) + r.chars(UPPER, 1);
}

function ifsc(r: Rng): string {
  return r.pick(['SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'PUNB', 'BARB', 'CNRB', 'IDIB', 'YESB']) + '0' + r.chars(UPPER + DIGITS, 6);
}

function upi(r: Rng): { value: string; known: boolean } {
  const handle = r.pick([() => `${r.pick(FIRST)}.${r.pick(LAST)}`, () => inMobile10(r), () => `${r.pick(FIRST)}${r.int(10, 99)}`])();
  if (r.next() < 0.8) return { value: `${handle}@${r.pick(['ybl', 'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'paytm', 'ibl', 'axl', 'upi'])}`, known: true };
  return { value: `${handle}@${r.pick(['examplebank', 'fakepsp', 'testupi'])}`, known: false };
}

function apiKey(r: Rng): { value: string; group: string } {
  return r.pick([
    () => ({ value: 'sk-' + 'proj-' + r.chars(B64URL, 48), group: 'openai-project' }),
    () => ({ value: 'sk-' + r.chars(ALNUM, 48), group: 'openai-legacy' }),
    () => ({ value: 'sk-' + 'ant-' + 'api03-' + r.chars(B64URL, 80), group: 'anthropic' }),
    () => ({ value: 'gh' + r.pick(['p', 'o', 's', 'u']) + '_' + r.chars(ALNUM, 36), group: 'github' }),
    () => ({ value: 'github_' + 'pat_' + r.chars(ALNUM, 22) + '_' + r.chars(ALNUM, 59), group: 'github-fine-grained' }),
    () => ({ value: 'AK' + 'IA' + r.chars(UPPER + '234567', 16), group: 'aws' }),
    () => ({ value: 'AI' + 'za' + r.chars(B64URL, 35), group: 'google' }),
    () => ({ value: 'xo' + 'xb-' + r.digits(12) + '-' + r.digits(13) + '-' + r.chars(ALNUM, 24), group: 'slack-bot' }),
    () => ({ value: 'xo' + 'xp-' + r.digits(12) + '-' + r.digits(12) + '-' + r.digits(13) + '-' + r.chars(HEX, 32), group: 'slack-user' }),
    () => ({ value: 's' + 'k_' + 'live_' + r.chars(ALNUM, 24), group: 'stripe' }),
    () => ({ value: 'h' + 'f_' + r.chars(ALNUM, 34), group: 'huggingface' }),
  ])();
}

function jwt(r: Rng): string {
  const header = b64url(JSON.stringify({ alg: r.pick(['HS256', 'RS256']), typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: r.digits(8), name: `${r.pick(FIRST)} ${r.pick(LAST)}`, iat: 1727000000 + r.int(0, 99999) }));
  return `${header}.${payload}.${r.chars(B64URL, 43)}`;
}

function privateKey(r: Rng): string {
  const kind = r.pick(['RSA ', 'EC ', 'OPENSSH ', '']);
  const lines = Array.from({ length: r.int(3, 8) }, () => r.chars(ALNUM + '+/', 64));
  return `-----BEGIN ${kind}PRIVATE KEY-----\n${lines.join('\n')}\n${r.chars(ALNUM + '+/', 20)}==\n-----END ${kind}PRIVATE KEY-----`;
}

function passwordValue(r: Rng): string {
  return r.pick([
    () => r.pick(['Sunshine', 'Monsoon', 'Chai', 'Tiger', 'Cricket']) + r.int(10, 9999) + r.pick(['!', '@', '#', '$']),
    () => r.chars(ALNUM + '!@#%^*', r.int(10, 20)),
    () => `${r.pick(FIRST)}@${r.int(1990, 2010)}`,
  ])();
}

function genericSecret(r: Rng): string {
  // Random base62 with at least one of each class so the shape is realistic.
  return r.chars(UPPER, 2) + r.chars(DIGITS, 2) + r.chars(LOWER, 2) + r.chars(ALNUM, r.int(26, 40));
}

// ------------------------------------------------------------------ positives

function positives(r: Rng, perCategory: number): Sample[] {
  const out: Sample[] = [];
  let n = 0;
  const add = (group: string, parts: Part[]) => out.push(build(`s${n++}`, group, parts));

  for (let i = 0; i < perCategory; i++) {
    const e = email(r);
    add('EMAIL', r.pick<Part[]>([
      ['Please send the invoice to ', { type: 'EMAIL', value: e }, ' by Friday.'],
      ['Contact: ', { type: 'EMAIL', value: e }],
      ['mujhe ', { type: 'EMAIL', value: e }, ' pe mail kar dena'],
      ['cc ', { type: 'EMAIL', value: e }, ' and ', { type: 'EMAIL', value: email(r) }, ' on the thread'],
      ['From: "', `${r.pick(FIRST)} ${r.pick(LAST)}`, '" <', { type: 'EMAIL', value: e }, '>'],
      ['git config user.email "', { type: 'EMAIL', value: e }, '"'],
    ]));
  }

  for (let i = 0; i < perCategory * 2; i++) {
    const p = phone(r);
    const lead = p.context
      ? r.pick(['My mobile is ', 'Call me on ', 'WhatsApp: ', 'mera phone number ', 'Contact no: tel '])
      : r.pick(['Reach out at ', 'Details: ', '', 'Office: ', 'Emergency ']);
    add(`PHONE/${p.group}`, [lead, { type: 'PHONE', value: p.value }, r.pick(['.', ' after 6pm.', ' hai', ''])]);
  }

  for (let i = 0; i < perCategory; i++) {
    const c = cardNumber(r);
    add(`CARD/${c.group}`, r.pick<Part[]>([
      ['charge it to ', { type: 'CARD', value: c.value }, ` exp ${r.int(1, 12)}/${r.int(27, 31)}`],
      ['Card number: ', { type: 'CARD', value: c.value }],
      ['why does ', { type: 'CARD', value: c.value }, ' fail validation in my form?'],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    const ip = ipAddress(r);
    add(`IP/${ip.group}`, r.pick<Part[]>([
      ['ssh into ', { type: 'IP', value: ip.value }, ' and restart nginx'],
      ['Failed login from ', { type: 'IP', value: ip.value }, ' at 03:12'],
      ['DB_HOST=', { type: 'IP', value: ip.value }],
      ip.value.includes(':')
        ? ['curl http://[', { type: 'IP', value: ip.value }, ']:8080/health']
        : ['curl http://', { type: 'IP', value: ip.value }, ':8080/health'],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    const a = aadhaar(r);
    const spaced = `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}`;
    const variant = r.int(0, 3);
    if (variant === 0) add('AADHAAR/spaced-context', ['My Aadhaar number is ', { type: 'AADHAAR', value: spaced }]);
    else if (variant === 1) add('AADHAAR/spaced-nocontext', ['ID: ', { type: 'AADHAAR', value: spaced }, ', DOB 01/01/1990']);
    else if (variant === 2) add('AADHAAR/compact-context', ['aadhar card no ', { type: 'AADHAAR', value: a }, ' hai']);
    else add('AADHAAR/compact-nocontext', ['ref ', { type: 'AADHAAR', value: a }, ' for the KYC form']);
  }

  for (let i = 0; i < perCategory; i++) {
    add('PAN', r.pick<Part[]>([
      ['PAN: ', { type: 'PAN', value: pan(r) }],
      ['my pan card is ', { type: 'PAN', value: pan(r) }, ', please fill the ITR'],
      ['Name: ', `${r.pick(FIRST)} ${r.pick(LAST)}`, ', ', { type: 'PAN', value: pan(r) }],
      ['pan no. ', { type: 'PAN', value: pan(r).toLowerCase() }, ' hai'],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    add('IFSC', r.pick<Part[]>([
      ['IFSC ', { type: 'IFSC', value: ifsc(r) }, ', account ending 4821'],
      ['transfer to branch code ', { type: 'IFSC', value: ifsc(r) }],
      ['Bank: ', { type: 'IFSC', value: ifsc(r) }, ' (Andheri)'],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    const u = upi(r);
    add(`UPI/${u.known ? 'known-psp' : 'unknown-psp-context'}`, u.known
      ? r.pick<Part[]>([['pay to ', { type: 'UPI', value: u.value }], ['bhai ', { type: 'UPI', value: u.value }, ' pe 500 bhej de']])
      : ['UPI ID: ', { type: 'UPI', value: u.value }]);
  }

  for (let i = 0; i < perCategory * 2; i++) {
    const k = apiKey(r);
    add(`API_KEY/${k.group}`, r.pick<Part[]>([
      ['here is my key ', { type: 'API_KEY', value: k.value }, ' why do I get 401?'],
      ['export TOKEN_X="', { type: 'API_KEY', value: k.value }, '"'],
      ['client = Client(', { type: 'API_KEY', value: k.value }, ')'],
      ['`', { type: 'API_KEY', value: k.value }, '` stopped working'],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    add('TOKEN/jwt', r.pick<Part[]>([
      ['Authorization: Bearer ', { type: 'TOKEN', value: jwt(r) }],
      ['decode this: ', { type: 'TOKEN', value: jwt(r) }],
    ]));
  }

  for (let i = 0; i < Math.ceil(perCategory / 2); i++) {
    add('PRIVATE_KEY', ['my deploy key:\n', { type: 'PRIVATE_KEY', value: privateKey(r) }, '\nwhy does ssh reject it?']);
  }

  for (let i = 0; i < perCategory; i++) {
    const pw = passwordValue(r);
    add('PASSWORD', r.pick<Part[]>([
      ['password=', { type: 'PASSWORD', value: pw }],
      ['DB_PASSWORD: "', { type: 'PASSWORD', value: pw }, '"'],
      ['{"user": "admin", "password": "', { type: 'PASSWORD', value: pw }, '"}'],
      ["conn = connect(host, pwd='", { type: 'PASSWORD', value: pw }, "')"],
      ['mysql -u root --password=', { type: 'PASSWORD', value: pw }],
    ]));
  }

  for (let i = 0; i < perCategory; i++) {
    const s = genericSecret(r);
    const variant = i % 6;
    if (variant === 0) add('SECRET/free-standing', ['the webhook signing value is ', { type: 'SECRET', value: s }]);
    else if (variant === 1) add('SECRET/free-standing', ['use ', { type: 'SECRET', value: s }, ' as the header value']);
    else if (variant === 2) add('SECRET/assignment', ['CLIENT_SECRET=', { type: 'SECRET', value: s }]);
    else if (variant === 3) add('SECRET/assignment-hex', ['api_key: "', { type: 'SECRET', value: r.chars(HEX, 32) }, '"']);
    else if (variant === 4) add('SECRET/url-param', ['?access_token=', { type: 'SECRET', value: s }, '&page=2']);
    // Known gap by design: free-standing pure hex is not flagged (see report).
    else add('SECRET/hex-free-standing', ['the signing key is ', { type: 'SECRET', value: r.chars(HEX, 40) }]);
  }

  // A few realistic mixed messages.
  for (let i = 0; i < perCategory; i++) {
    const p = phone(r);
    add('MIXED', [
      'Hi, I am ', `${r.pick(FIRST)} `, '(', { type: 'EMAIL', value: email(r) }, ', ph ', { type: 'PHONE', value: p.value },
      '). My PAN is ', { type: 'PAN', value: pan(r) }, ' and salary goes to ', { type: 'IFSC', value: ifsc(r) },
      '. Server ', { type: 'IP', value: ipAddress(r).value }, ' uses key ', { type: 'API_KEY', value: apiKey(r).value }, '.',
    ]);
  }
  return out;
}

// ------------------------------------------------------------------ hard negatives

function negatives(r: Rng, count: number): Sample[] {
  const gens: { group: string; make: () => string }[] = [
    { group: 'git-sha', make: () => `fixed in commit ${r.chars(HEX, 40)}` },
    { group: 'short-sha', make: () => `see ${r.chars(HEX, 7)} and ${r.chars(HEX, 7)}` },
    { group: 'uuid', make: () => `request id ${r.chars(HEX, 8)}-${r.chars(HEX, 4)}-4${r.chars(HEX, 3)}-a${r.chars(HEX, 3)}-${r.chars(HEX, 12)}` },
    { group: 'md5', make: () => `md5sum: ${r.chars(HEX, 32)}  file.tar.gz` },
    { group: 'sha256', make: () => `sha256:${r.chars(HEX, 64)}` },
    { group: 'version', make: () => `upgrade to version ${r.int(1, 12)}.${r.int(0, 20)}.${r.int(0, 30)}.${r.int(0, 9999)}` },
    { group: 'semver', make: () => `react@${r.int(16, 19)}.${r.int(0, 9)}.${r.int(0, 9)} and node v${r.int(18, 24)}.${r.int(0, 9)}.${r.int(0, 9)}` },
    { group: 'unix-ts', make: () => `created_at: ${1727000000 + r.int(0, 999999)}` },
    { group: 'iso-date', make: () => `2026-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}T10:${r.int(10, 59)}:00Z` },
    { group: 'time', make: () => `meeting at ${r.int(10, 12)}:${r.int(10, 59)}:${r.int(10, 59)} IST` },
    { group: 'order-12digit', make: () => `Order #${r.int(1, 9)}${r.digits(11)} shipped` },
    { group: 'order-10digit', make: () => `Invoice ${r.int(1, 5)}${r.digits(9)} is overdue` },
    { group: 'non-luhn-16', make: () => { const p = '4' + r.digits(14); const bad = (Number(luhnCheckDigit(p)) + r.int(1, 9)) % 10; return `ref ${p}${bad}`; } },
    { group: 'money', make: () => `total ₹${r.int(1, 99)},${r.digits(2)},${r.digits(3)}.00 incl GST` },
    { group: 'camelCase', make: () => `call getUserAccountSettingsById${r.int(2, 9)}() then updateProfilePreferences${r.int(2, 9)}` },
    { group: 'snake_case', make: () => `the function validate_customer_billing_address_v${r.int(2, 9)} is slow` },
    { group: 'path', make: () => `edit src/components/UserProfile${r.int(2, 9)}/hooks/useAccountData.ts` },
    { group: 'url', make: () => `https://docs.example.com/guides/getting-started/Install${r.int(2, 9)}Steps?ref=nav` },
    { group: 'env-ref', make: () => r.pick(['password = os.environ["DB_PASSWORD"]', 'api_key = getenv("OPENAI_KEY")', 'token: process.env.GITHUB_TOKEN', 'SECRET_KEY=${SECRET_KEY}', 'password: <your-password>']) },
    { group: 'type-annotation', make: () => r.pick(['interface Login { password: string; token: string }', 'def login(user: str, password: str) -> Token:', 'password: required, min 8 chars']) },
    { group: 'prose-password', make: () => r.pick(['Enter your password: then press Enter.', 'The token: expires after an hour.', 'Forgot password? Click reset.']) },
    { group: 'ssh-remote', make: () => `git clone git@github.com:${r.pick(FIRST)}/${r.pick(['tessera', 'notes', 'infra'])}.git` },
    { group: 'user-at-host', make: () => `ssh ${r.pick(FIRST)}@buildbox${r.int(1, 9)} and run make` },
    { group: 'npm-scope', make: () => `pnpm add @types/node @vitest/ui` },
    { group: 'decorator', make: () => `@property\ndef name(self): return self._name` },
    { group: 'loopback', make: () => r.pick(['listen on 127.0.0.1:3000', 'bind 0.0.0.0', 'mask 255.255.255.255']) },
    { group: 'ipv6-lookalike', make: () => r.pick(['std::vector<int>::iterator', 'MAC 00:1A:2B:3C:4D:5E', 'ratio 16:9:4', 'Foo::Bar::baz()']) },
    { group: 'allcaps-words', make: () => r.pick(['PLEASE READ THIS CAREFULLY', 'HTTP 404 NOT FOUND', 'USE UTF8 ENCODING', 'SELECT * FROM USERS']) },
    { group: 'small-numbers', make: () => `call 100 or 112 in an emergency; room 4021, floor 3` },
    { group: 'base64-words', make: () => `aGVsbG8gd29ybGQ= is just "hello world"` },
    { group: 'css', make: () => `color: #1a2b3c; margin: 0 auto; font: 14px/1.5 system-ui` },
    { group: 'npm-integrity', make: () => `"integrity": "sha512-${r.chars(ALNUM + '+/', 86)}=="` },
    { group: 'drive-file-id', make: () => `https://drive.example.com/file/d/1${r.chars(B64URL, 32)}/view` },
    { group: 'yt-id', make: () => `watch?v=${r.chars(B64URL, 11)} at 2:30` },
    { group: 'bank-account', make: () => `A/c no 5010${r.digits(10)}` },
    { group: 'isbn', make: () => `ISBN 978-${r.int(0, 9)}-${r.digits(3)}-${r.digits(5)}-${r.int(0, 9)}` },
    { group: 'aws-doc-example', make: () => 'the docs use AKIAIOSFODNN7EXAMPLE as a sample' },
    { group: 'hinglish', make: () => `kal 5 baje milte hain, ${r.pick(FIRST)} ko bhi bula lena` },
  ];
  const out: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const g = gens[i % gens.length]!;
    out.push({ id: `n${i}`, group: `negative/${g.group}`, text: g.make(), labels: [] });
  }
  return out;
}

export interface DatasetOptions {
  seed?: number;
  /** Base number of positive samples per category (some categories get 2x). */
  perCategory?: number;
  negatives?: number;
}

export function buildDataset(opts: DatasetOptions = {}): Sample[] {
  const r = new Rng(opts.seed ?? DEFAULT_SEED);
  return [...positives(r, opts.perCategory ?? 60), ...negatives(r, opts.negatives ?? 640)];
}
