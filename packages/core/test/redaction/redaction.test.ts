import { describe, expect, it } from 'vitest';
import {
  luhnCheckDigit,
  luhnValid,
  shannonEntropy,
  verhoeffCheckDigit,
  verhoeffValid,
} from '../../src/redaction/checksums';
import { detect, pasteWarnings } from '../../src/redaction/detect';
import { RedactionSession, toggleItem, toggleType } from '../../src/redaction/session';
import { maskValue, redactionSummary, reviewRows } from '../../src/redaction/review';
import { b64url } from '../../src/redaction/eval/synthetic';
import type { DetectionType } from '../../src/redaction/types';

// Credential-shaped test values are assembled at run time so no literal token
// sits in the repository (and secret scanners stay quiet).
const repeat = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
const fake = {
  github: () => 'gh' + 'p_' + repeat('aB3dE5gH7jK9mN1pQ', 36),
  openai: () => 'sk-' + 'proj-' + repeat('Xy7_Zq2-Lm9', 48),
  aws: () => 'AK' + 'IA' + 'Q2WX3EC4RV5TB6YN',
  google: () => 'AI' + 'za' + repeat('Sy9-Xk_3Lm2Qw8', 35),
  slack: () => 'xo' + 'xb-' + '123456789012-1234567890123-' + repeat('AbCdEf123', 24),
  jwt: () =>
    b64url('{"alg":"HS256","typ":"JWT"}') +
    '.' +
    b64url('{"sub":"1234567890","name":"Test User"}') +
    '.' +
    repeat('Sfl_KxwRJ-SMeKKF2QT4fwpM', 43),
};

function types(text: string): DetectionType[] {
  return detect(text).map((d) => d.type);
}
function values(text: string): string[] {
  return detect(text).map((d) => text.slice(d.span.start, d.span.end));
}

describe('checksums', () => {
  it('encodes base64url like the platform does', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['a', 'YQ'],
      ['ab', 'YWI'],
      ['abc', 'YWJj'],
      ['abcd', 'YWJjZA'],
      ['{"alg":"HS256"}', 'eyJhbGciOiJIUzI1NiJ9'],
      ['??>', 'Pz8-'],
    ];
    for (const [input, expected] of cases) expect(b64url(input)).toBe(expected);
  });

  it('validates Luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('41111a')).toBe(false);
    expect(luhnValid('401288888888188' + luhnCheckDigit('401288888888188'))).toBe(true);
  });

  it('validates Verhoeff', () => {
    // Worked example from the Verhoeff algorithm description: 236 -> check digit 3.
    expect(verhoeffCheckDigit('236')).toBe('3');
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
    const payload = '23456789012';
    expect(verhoeffValid(payload + verhoeffCheckDigit(payload))).toBe(true);
  });

  it('catches every single-digit error and adjacent transposition (Verhoeff property)', () => {
    const payload = '98765432101';
    const ok = payload + verhoeffCheckDigit(payload);
    for (let i = 0; i < ok.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === ok[i]) continue;
        expect(verhoeffValid(ok.slice(0, i) + d + ok.slice(i + 1))).toBe(false);
      }
      if (i < ok.length - 1 && ok[i] !== ok[i + 1]) {
        expect(verhoeffValid(ok.slice(0, i) + ok[i + 1] + ok[i] + ok.slice(i + 2))).toBe(false);
      }
    }
  });

  it('computes Shannon entropy', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBe(2);
  });
});

describe('secret detectors', () => {
  it.each([
    ['GitHub token', fake.github()],
    ['OpenAI project key', fake.openai()],
    ['AWS access key id', fake.aws()],
    ['Google API key', fake.google()],
    ['Slack bot token', fake.slack()],
  ])('flags a %s as API_KEY', (_name, key) => {
    const text = `my key is ${key} please help`;
    expect(detect(text)).toMatchObject([{ type: 'API_KEY' }]);
    expect(values(text)).toEqual([key]);
  });

  it('flags JWTs', () => {
    expect(types(`Authorization: Bearer ${fake.jwt()}`)).toEqual(['TOKEN']);
  });

  it('flags a whole private key block', () => {
    const body = Array.from({ length: 4 }, (_, i) =>
      repeat(`MIIEv${i}QIBADANBgkqhkiG9w0BAQEFAASC`, 64),
    ).join('\n');
    const block = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
    expect(values(`key:\n${block}\nthanks`)).toEqual([block]);
  });

  it('redacts only the value of password and secret assignments', () => {
    expect(values('password=Hunter2!x')).toEqual(['Hunter2!x']);
    expect(values('{"password": "Tr0ub4dor&3"}')).toEqual(['Tr0ub4dor&3']);
    expect(detect('DB_PASSWORD: "Monsoon2024#"')).toMatchObject([{ type: 'PASSWORD' }]);
    // A leading % is a real password character unless it is clearly a template.
    expect(values('password: "%qj1myIUllsFAx"')).toEqual(['%qj1myIUllsFAx']);
    expect(detect('client_secret = "abcDEF123ghiJKL456"')).toMatchObject([{ type: 'SECRET' }]);
  });

  it.each([
    'password = os.environ["DB_PASSWORD"]',
    'api_key = getenv("KEY")',
    'token: process.env.GITHUB_TOKEN',
    'SECRET_KEY=${SECRET_KEY}',
    'password=$DB_PASSWORD',
    'pass=$db_pass',
    "password = '%(db_password)s'",
    'password: {{ vault_password }}',
    'password: <your-password>',
    'password: required',
    'Enter your password: then press Enter.',
    'interface Login { password: string }',
    'password=********',
  ])('ignores template or prose: %s', (text) => {
    expect(detect(text)).toEqual([]);
  });

  it('flags free-standing high-entropy strings but not hashes, UUIDs or identifiers', () => {
    expect(types('use Qz8Lm3Nx7Rt2Vb9Kp4Wj6Hs1Df5Ga0Ec as the header')).toEqual(['SECRET']);
    expect(detect(`commit ${repeat('3f9a0c1b2d', 40)}`)).toEqual([]);
    expect(detect('id 3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toEqual([]);
    expect(detect('call getUserAccountSettingsById2() now')).toEqual([]);
    expect(
      detect('"integrity": "sha512-' + repeat('Qz8Lm3Nx7Rt2Vb9Kp4Wj6Hs1Df5Ga0Ec+/', 86) + '=="'),
    ).toEqual([]);
  });

  it('ignores the AWS documentation sample key', () => {
    expect(detect('AKIA' + 'IOSFODNN7EXAMPLE')).toEqual([]);
  });
});

describe('personal data detectors', () => {
  it('flags emails but not SSH remotes or npm scopes', () => {
    expect(values('mail priya.sharma+work@example.co.in today')).toEqual([
      'priya.sharma+work@example.co.in',
    ]);
    expect(detect('git clone git@github.com:org/repo.git')).toEqual([]);
    expect(detect('pnpm add @types/node')).toEqual([]);
  });

  it.each([
    '+91 98765 43210',
    '+91-9876543210',
    '+919876543210',
    '09876543210',
    '987-654-3210',
    '+44 20 7946 0123',
    '+1 (415) 555-0132',
    '415-555-0132',
    '022-2345 6789',
  ])('flags phone number %s', (p) => {
    expect(values(`call me on ${p} tomorrow`)).toEqual([p]);
  });

  it('weights bare 10-digit numbers by context', () => {
    expect(detect('my mobile 9876543210')[0]?.confidence).toBeGreaterThan(0.8);
    expect(detect('ref 9876543210')[0]?.confidence).toBeLessThan(0.8);
    expect(detect('md5 2e2f7fc40c85a9906962792e1d7b71b6')).toEqual([]);
  });

  it('flags Luhn-valid cards only', () => {
    expect(values('card 4111 1111 1111 1111 exp 12/29')).toEqual(['4111 1111 1111 1111']);
    expect(values('amex 3782-822463-10005')).toEqual(['3782-822463-10005']);
    expect(detect('ref 4111 1111-1111 1111')).toEqual([]); // mixed separators
    expect(values('amex 378282246310005')).toEqual(['378282246310005']);
    expect(detect('ref 4111111111111112')).toEqual([]);
  });

  it('flags IPv4 and IPv6 but not versions, loopback or C++ scopes', () => {
    expect(values('ssh 203.0.113.7 now')).toEqual(['203.0.113.7']);
    expect(values('host 2001:db8:85a3::8a2e:370:7334')).toEqual(['2001:db8:85a3::8a2e:370:7334']);
    expect(detect('upgrade to version 10.0.19041.1')).toEqual([]);
    expect(detect('listen on 127.0.0.1:3000')).toEqual([]);
    expect(detect('std::vector<int>::iterator at 10:30:00')).toEqual([]);
    expect(detect('MAC 00:1A:2B:3C:4D:5E')).toEqual([]);
  });
});

describe('India-specific detectors', () => {
  const payload = '28475930162';
  const aadhaar = payload + verhoeffCheckDigit(payload);
  const spaced = `${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}`;

  it('flags Verhoeff-valid Aadhaar numbers', () => {
    expect(values(`Aadhaar: ${spaced}`)).toEqual([spaced]);
    expect(values(`aadhar no ${aadhaar}`)).toEqual([aadhaar]);
  });

  it('rejects Aadhaar numbers that fail Verhoeff or start with 0/1', () => {
    const bad = aadhaar.slice(0, 11) + String((Number(aadhaar[11]) + 1) % 10);
    expect(detect(`Aadhaar: ${bad}`)).toEqual([]);
    expect(detect(`Aadhaar: 1${aadhaar.slice(1)}`).filter((d) => d.type === 'AADHAAR')).toEqual([]);
  });

  it('keeps unseparated, context-free 12-digit numbers below the default threshold', () => {
    expect(detect(`order ${aadhaar}`)).toEqual([]);
    expect(detect(`order ${aadhaar}`, { minConfidence: 0.4 })).toMatchObject([{ type: 'AADHAAR' }]);
  });

  it('does not see an Aadhaar inside a spaced card number', () => {
    expect(types('4111 1111 1111 1111')).toEqual(['CARD']);
  });

  it('flags PAN, IFSC and UPI', () => {
    expect(detect('PAN ABCPE1234F, IFSC SBIN0001234, pay priya.s@okaxis')).toMatchObject([
      { type: 'PAN' },
      { type: 'IFSC' },
      { type: 'UPI' },
    ]);
    expect(types('my pan is abcpe1234f')).toEqual(['PAN']);
  });

  it('tells UPI IDs from emails and user@host', () => {
    expect(types('pay 9876543210@ybl')).toEqual(['UPI']);
    expect(types('mail a@example.com')).toEqual(['EMAIL']);
    expect(detect('ssh priya@buildbox3')).toEqual([]);
    expect(types('UPI ID: priya@newbank')).toEqual(['UPI']);
  });
});

describe('options', () => {
  it('honours per-category toggles and the confidence floor', () => {
    const text = 'mail a@example.com from 203.0.113.9';
    expect(types(text)).toEqual(['EMAIL', 'IP']);
    expect(detect(text, { enabled: { IP: false } }).map((d) => d.type)).toEqual(['EMAIL']);
    expect(detect(text, { minConfidence: 0.95 }).map((d) => d.type)).toEqual(['EMAIL']);
  });

  it('warns on pasted secrets but not on ordinary personal data', () => {
    expect(pasteWarnings(`here: ${fake.github()}`)).toHaveLength(1);
    expect(pasteWarnings('write to a@example.com')).toEqual([]);
  });
});

describe('RedactionSession', () => {
  it('uses stable placeholders per value and type', () => {
    const s = new RedactionSession();
    const r = s.redact('a@example.com, b@example.com, again a@example.com, ph +91 98765 43210');
    expect(r.text).toBe('[EMAIL_1], [EMAIL_2], again [EMAIL_1], ph [PHONE_1]');
    // Same session, later message: same value keeps its placeholder, new ones continue the count.
    expect(s.redact('b@example.com and c@example.com').text).toBe('[EMAIL_2] and [EMAIL_3]');
  });

  it('restores placeholders in model output', () => {
    const s = new RedactionSession();
    const r = s.redact('Email a@example.com about PAN ABCPE1234F');
    const answer = `Dear [EMAIL_1], your PAN [PAN_1] is linked. [PHONE_9] is unknown.`;
    expect(r.text).toBe('Email [EMAIL_1] about PAN [PAN_1]');
    expect(s.restore(answer)).toBe(
      'Dear a@example.com, your PAN ABCPE1234F is linked. [PHONE_9] is unknown.',
    );
  });

  it('never reuses a placeholder that already appears literally in the text', () => {
    const s = new RedactionSession();
    const r = s.redact('template uses [EMAIL_1]; real one is a@example.com');
    expect(r.text).toBe('template uses [EMAIL_1]; real one is [EMAIL_2]');
    expect(s.restore(r.text)).toBe('template uses [EMAIL_1]; real one is a@example.com');
  });

  it('toggles items and whole categories without mutating the input', () => {
    const s = new RedactionSession();
    const r = s.redact('a@example.com at 203.0.113.9');
    const off = toggleItem(r, r.items[1]!.id);
    expect(off.text).toBe('[EMAIL_1] at 203.0.113.9');
    expect(r.text).toBe('[EMAIL_1] at [IP_1]');
    expect(toggleItem(off, r.items[1]!.id).text).toBe('[EMAIL_1] at [IP_1]');
    expect(toggleType(r, 'EMAIL', false).text).toBe('a@example.com at [IP_1]');
  });

  it('keeps the mapping out of JSON and forgets it on clear()', () => {
    const s = new RedactionSession();
    s.redact('a@example.com');
    expect(JSON.stringify(s)).toBe('{"size":1}');
    s.clear();
    expect(s.size).toBe(0);
    expect(s.restore('[EMAIL_1]')).toBe('[EMAIL_1]');
  });
});

describe('review view model', () => {
  it('masks secrets and builds accessible rows', () => {
    const s = new RedactionSession();
    const key = fake.github();
    const r = s.redact(`key ${key} card 4111 1111 1111 1111 mail a@example.com`);
    const rows = reviewRows(r);
    expect(rows.map((x) => x.preview)).toEqual([
      `${key.slice(0, 4)}…${key.slice(-2)}`,
      '•••• 1111',
      'a@example.com',
    ]);
    expect(rows.every((x) => !x.preview.includes(key.slice(4, -2)))).toBe(true);
    expect(rows[2]!.ariaLabel).toBe('Redacting email address a@example.com as [EMAIL_1]');
  });

  it('summarizes enabled redactions', () => {
    const s = new RedactionSession();
    const r = s.redact('a@example.com b@example.com 203.0.113.9');
    expect(redactionSummary(r)).toBe('Redacted 2 email addresses and 1 IP address');
    expect(redactionSummary(toggleType(r, 'EMAIL', false))).toBe('Redacted 1 IP address');
    expect(redactionSummary(toggleType(toggleType(r, 'EMAIL', false), 'IP', false))).toBe(
      'Nothing redacted',
    );
  });

  it('masks private keys to a fixed label', () => {
    expect(
      maskValue('PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'),
    ).toBe('-----BEGIN … PRIVATE KEY-----');
  });
});

describe('performance', () => {
  it.each([
    ['identifier runs', 'a_'.repeat(20000)],
    ['dashed runs', 'a-'.repeat(30000)],
    ['spaced digits', '1 '.repeat(50000)],
    ['dotted domains', 'a@' + 'a.'.repeat(40000)],
    ['unterminated key block', '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(100000)],
  ])('stays linear on %s', (_name, text) => {
    const t = Date.now();
    detect(text);
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
