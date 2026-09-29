import { tidyScrapedText } from '@tessera/core';
import type { CodeBlock } from '@tessera/core';

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'svg']);

/**
 * Reads what a user would see in a composer. `innerText` would do this in a
 * browser, but it is layout-dependent and missing in jsdom, so walk the tree.
 */
export function readComposerText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    lines.push(current);
    current = '';
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        current += child.textContent ?? '';
      } else if (child.nodeType === 1) {
        const tag = (child as Element).tagName;
        if (SKIP_TAGS.has(tag)) continue;
        if (tag === 'BR') {
          // A <br> at the end of a block (ProseMirror's trailing break, or the
          // placeholder in an empty paragraph) does not start a new line.
          if (!child.nextSibling && BLOCK_TAGS.has(child.parentElement?.tagName ?? '')) continue;
          flush();
          continue;
        }
        const block = BLOCK_TAGS.has(tag);
        if (block && current) flush();
        const before = lines.length;
        walk(child);
        // Flush leftover text; an empty block with no lines inside is a blank line.
        if (block && (current || lines.length === before)) flush();
      }
    }
  };
  walk(el);
  if (current) flush();
  // Placeholders such as ProseMirror's empty-paragraph hint live in CSS, not text,
  // so an empty editor reads as a list of empty lines.
  return lines.join('\n').replace(/\n+$/, '');
}

export interface ExtractedMessage {
  text: string;
  codeBlocks: CodeBlock[];
}

/**
 * Turns a rendered message into plain text with fenced code blocks, and collects
 * the code verbatim. Code is taken from `textContent`, never re-flowed.
 */
export function extractMessage(root: Element, ignore: string[]): ExtractedMessage {
  const codeBlocks: CodeBlock[] = [];
  let out = '';
  const ignoreSel = ignore.join(',');

  const walk = (node: Node, inList: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        out += (child.textContent ?? '').replace(/\s+/g, ' ');
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (ignoreSel && el.matches(ignoreSel) && !el.querySelector('pre')) continue;
      if (el.tagName === 'PRE') {
        codeBlocks.push(readCodeBlock(el));
        // A placeholder keeps whitespace clean-up away from the code; the fence goes in at the end.
        out += `\n\uE000${codeBlocks.length - 1}\uE000\n`;
        continue;
      }
      if (el.tagName === 'BR') {
        out += '\n';
        continue;
      }
      if (el.tagName === 'CODE') {
        out += `\`${el.textContent ?? ''}\``;
        continue;
      }
      const block = BLOCK_TAGS.has(el.tagName);
      if (block) out += '\n';
      if (el.tagName === 'LI')
        out += inList && el.parentElement?.tagName === 'OL' ? `${indexInList(el)}. ` : '- ';
      walk(el, inList || el.tagName === 'UL' || el.tagName === 'OL');
      if (block) out += '\n';
    }
  };

  walk(root, false);
  const prose = tidyScrapedText(out.replace(/[ \t]*\n[ \t]*/g, '\n'))
    // Paragraphs are separated by a blank line, list items are not.
    .replace(/(?<=^(?:- |\d+\. )[^\n]*)\n\n(?=(?:- |\d+\. ))/gm, '\n');
  const text = prose.replace(/\uE000(\d+)\uE000/g, (_, i: string) => {
    const block = codeBlocks[Number(i)]!;
    return `\`\`\`${block.language}\n${block.code.replace(/\n$/, '')}\n\`\`\``;
  });
  return { text, codeBlocks };
}

function indexInList(li: Element): number {
  const start = Number(li.parentElement?.getAttribute('start') ?? '1') || 1;
  return (
    start +
    Array.from(li.parentElement?.children ?? [])
      .filter((c) => c.tagName === 'LI')
      .indexOf(li)
  );
}

export function readCodeBlock(pre: Element): CodeBlock {
  const code = pre.querySelector('code') ?? pre;
  // CodeMirror-rendered blocks (used by some sites) keep one div per line with no newline characters.
  const cmLines = pre.querySelectorAll('.cm-content .cm-line');
  const text = cmLines.length
    ? Array.from(cmLines, (l) => l.textContent ?? '').join('\n')
    : (code.textContent ?? '');
  return { language: detectLanguage([code, pre.querySelector('.cm-content'), pre]), code: text };
}

function detectLanguage(candidates: (Element | null)[]): string {
  for (const el of candidates) {
    if (!el) continue;
    const attr = el.getAttribute('data-language') ?? el.getAttribute('data-lang');
    if (attr) return attr.trim().toLowerCase();
    const cls = Array.from(el.classList).find((c) => /^(language|lang)-/.test(c));
    if (cls) return cls.replace(/^(language|lang)-/, '').toLowerCase();
  }
  return '';
}
