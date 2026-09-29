#!/usr/bin/env node
// Builds the static results site (GitHub Pages) from docs/benchmarks/*.md into site-dist/.
// The pages are generated from the same Markdown the eval scripts write, so the site can never
// show a number the scripts did not produce. No dependencies: a small Markdown subset is enough.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docs/benchmarks');
const out = path.join(root, 'site-dist');

const PAGES = [
  ['gate', 'Prompt gate'],
  ['capsule-coverage', 'Capsule coverage'],
  ['redaction', 'Redaction'],
  ['prompt-quality', 'Prompt quality'],
  ['handoff-fidelity', 'Handoff fidelity'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  const codes = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => `\uE001${codes.push(c) - 1}\uE001`);
  t = t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_\s][^_]*)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      const local = href.match(/^([\w-]+)\.md(#.*)?$/);
      const target = local
        ? `${local[1]}.html${local[2] ?? ''}`
        : href.startsWith('http')
          ? href
          : `https://github.com/Its-Aditya-Singhal/Tessera/blob/main/docs/benchmarks/${href}`;
      return `<a href="${target}">${text}</a>`;
    });
  return t.replace(/\uE001(\d+)\uE001/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      html.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) =>
        r
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      const [head, , ...body] = rows;
      html.push(
        `<table><thead><tr>${cells(head)
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map(
            (r) =>
              `<tr>${cells(r)
                .map((c) => `<td>${inline(c)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+|^\s{2,}\S/.test(lines[i]); i++) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i]))
          items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    for (
      ;
      i < lines.length && lines[i].trim() && !/^(#|\||```|\s*([-*]|\d+\.)\s)/.test(lines[i]);
      i++
    )
      para.push(lines[i].trim());
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return html.join('\n');
}

const CSS = `
:root { --bg: #fff; --fg: #1b1d21; --muted: #5d6370; --border: #d9dce2; --accent: #2f5bd3; --soft: #f3f5f8; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #16181c; --fg: #eceef2; --muted: #a3a9b5; --border: #3a3e47; --accent: #7d9bff; --soft: #22252b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
nav { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 12px 16px; border-bottom: 1px solid var(--border); max-width: 900px; margin: 0 auto; }
nav a { color: var(--muted); text-decoration: none; font-weight: 600; }
nav a[aria-current] { color: var(--accent); }
a { color: var(--accent); }
h1 { font-size: 28px; line-height: 1.25; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: 14px; margin: 12px 0; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; white-space: nowrap; }
th { background: var(--soft); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft); padding: 1px 4px; border-radius: 4px; }
pre { background: var(--soft); padding: 12px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 16px 0; }
.card { border: 1px solid var(--border); border-radius: 10px; padding: 14px; text-decoration: none; color: inherit; }
.card strong { display: block; color: var(--accent); }
footer { color: var(--muted); font-size: 13px; margin-top: 40px; }
`;

function page(title, body, current) {
  const nav = [['index', 'Overview'], ...PAGES]
    .map(
      ([id, label]) =>
        `<a href="${id}.html"${id === current ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Tessera benchmarks</title><style>${CSS}</style></head>
<body><nav>${nav}</nav><main>${body}
<footer>Generated from <a href="https://github.com/Its-Aditya-Singhal/Tessera/tree/main/docs/benchmarks">docs/benchmarks</a>. Every number comes from a script in the repository; nothing here is typed by hand.</footer>
</main></body></html>
`;
}

function firstParagraph(md) {
  const p = md
    .split('\n\n')
    .find((b) => b.trim() && !b.startsWith('#') && !/^Generated by/.test(b.trim()));
  return p ? inline(p.replace(/\n/g, ' ').slice(0, 220)) + (p.length > 220 ? '…' : '') : '';
}

function main() {
  mkdirSync(out, { recursive: true });
  const available = new Set(
    readdirSync(src)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3)),
  );
  const cards = [];
  for (const [id, label] of PAGES) {
    if (!available.has(id)) continue;
    const md = readFileSync(path.join(src, `${id}.md`), 'utf8');
    writeFileSync(path.join(out, `${id}.html`), page(label, markdownToHtml(md), id));
    cards.push(
      `<a class="card" href="${id}.html"><strong>${label}</strong>${firstParagraph(md)}</a>`,
    );
  }
  const intro = `<h1>Tessera benchmarks</h1>
<p>Tessera is a local-first Chrome extension that optimizes prompts, redacts private data and hands conversations between AI chatbots, on your device. These pages hold its measured results. Benchmarks that need a language model stay empty until a real run exists.</p>
<div class="cards">${cards.join('')}</div>
<p><a href="https://github.com/Its-Aditya-Singhal/Tessera">Source, install instructions and releases</a></p>`;
  writeFileSync(path.join(out, 'index.html'), page('Overview', intro, 'index'));
  console.info(`Wrote ${cards.length + 1} pages to ${path.relative(root, out)}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
