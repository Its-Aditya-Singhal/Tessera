import type { AttachmentMeta, Message, Role } from '@tessera/core';
import { extractMessage, readComposerText } from './extract';
import { injectText, type InjectResult } from './inject';
import type { SelectorGroup, SiteAdapter, SiteConfig } from './types';

export interface CaptureOptions {
  /** How many times to scroll up for older messages before giving up. */
  maxScrolls?: number;
  /** Wait after each scroll for the site to render more turns. */
  scrollSettleMs?: number;
}

export interface CaptureResult {
  messages: Message[];
  /** False when older messages may still be unloaded (hit the scroll cap). */
  complete: boolean;
  note: string;
}

export interface DomSiteAdapter extends SiteAdapter {
  config: SiteConfig;
  /** Details of the most recent setComposerText call, for diagnostics and error messages. */
  lastInject(): InjectResult | undefined;
  captureMessages(opts?: CaptureOptions): Promise<CaptureResult>;
  waitForComposer(timeoutMs?: number): Promise<HTMLElement | null>;
  /** Which selector in a group matched, or undefined when none did. */
  resolve(
    group: SelectorGroup,
    scope?: ParentNode,
  ): { selector: string; elements: Element[] } | undefined;
}

export interface DomAdapterOptions {
  doc?: Document;
  settleMs?: number;
}

export function createDomAdapter(
  config: SiteConfig,
  options: DomAdapterOptions = {},
): DomSiteAdapter {
  const doc = options.doc ?? document;
  let last: InjectResult | undefined;

  const resolve: DomSiteAdapter['resolve'] = (group, scope = doc) => {
    for (const selector of config.selectors[group]) {
      let elements: Element[];
      try {
        elements = Array.from(scope.querySelectorAll(selector));
      } catch {
        continue; // An invalid selector is reported by diagnostics, not thrown at the user.
      }
      if (elements.length) return { selector, elements };
    }
    return undefined;
  };

  const findComposer = (): HTMLElement | null => {
    const hit = resolve('composer');
    const el = hit?.elements.find((e) => !e.closest('[aria-hidden="true"],[hidden]'));
    return (el as HTMLElement | undefined) ?? null;
  };

  const sendAccepted = (): boolean => {
    const btn = resolve('sendButton')?.elements[0];
    // No send button found means we cannot judge; read-back decides on its own.
    if (!btn) return true;
    return !(btn as HTMLButtonElement).disabled && btn.getAttribute('aria-disabled') !== 'true';
  };

  const turns = (): { el: Element; role: Role }[] => {
    const user = resolve('userTurn')?.elements ?? [];
    const assistant = resolve('assistantTurn')?.elements ?? [];
    const all = [
      ...user.map((el) => ({ el, role: 'user' as const })),
      ...assistant.map((el) => ({ el, role: 'assistant' as const })),
    ];
    // Drop turns nested inside another matched turn so wrappers are not counted twice.
    const outer = all.filter((t) => !all.some((o) => o !== t && o.el.contains(t.el)));
    return outer.sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  };

  const attachmentsIn = (scope: ParentNode): AttachmentMeta[] => {
    const hit = resolve('attachment', scope);
    return (hit?.elements ?? []).map((el) => ({
      name:
        el.getAttribute('title') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        el.getAttribute('data-name') ||
        (el.textContent ?? '').trim() ||
        'unnamed',
      type: el.getAttribute('data-type') || (el.tagName === 'IMG' ? 'image' : 'file'),
    }));
  };

  const readMessages = (): Message[] =>
    turns().map(({ el, role }) => {
      const { text, codeBlocks } = extractMessage(el, [
        ...config.selectors.ignoreInMessage,
        ...config.selectors.attachment,
      ]);
      return { role, text, codeBlocks, attachments: attachmentsIn(el) };
    });

  const captureMessages = async (opts: CaptureOptions = {}): Promise<CaptureResult> => {
    const maxScrolls = opts.maxScrolls ?? 25;
    const settle = opts.scrollSettleMs ?? 400;
    const scroller = resolve('scrollContainer')?.elements[0] as HTMLElement | undefined;
    let complete = true;
    if (scroller) {
      const originalTop = scroller.scrollTop;
      let count = turns().length;
      let stable = 0;
      let scrolls = 0;
      while (stable < 2) {
        if (scrolls >= maxScrolls) {
          complete = false;
          break;
        }
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event('scroll'));
        scrolls++;
        await sleep(settle);
        const next = turns().length;
        stable = next === count ? stable + 1 : 0;
        count = next;
      }
      scroller.scrollTop = originalTop;
    }
    const messages = readMessages();
    const note = complete
      ? `Captured ${messages.length} messages.`
      : `Captured ${messages.length} messages. Older messages may not have loaded; scroll to the top of the chat and try again.`;
    return { messages, complete, note };
  };

  return {
    id: config.id,
    config,
    resolve,
    matches(url: URL) {
      return (
        config.hosts.includes(url.hostname) &&
        (!config.pathPrefix || url.pathname.startsWith(config.pathPrefix))
      );
    },
    findComposer,
    getComposerText() {
      const el = findComposer();
      return el ? readComposerText(el) : '';
    },
    async setComposerText(text: string) {
      last = await injectText(text, {
        findComposer,
        readText: readComposerText,
        sendAccepted,
        ...(options.settleMs !== undefined ? { settleMs: options.settleMs } : {}),
      });
      return last.ok;
    },
    lastInject: () => last,
    onComposerChange(cb) {
      // Listen at the document so the callback survives the editor replacing its element.
      const handler = (ev: Event) => {
        const el = findComposer();
        if (el && ev.target instanceof Node && (el === ev.target || el.contains(ev.target))) {
          cb(readComposerText(el));
        }
      };
      doc.addEventListener('input', handler, true);
      return () => doc.removeEventListener('input', handler, true);
    },
    async getMessages() {
      return (await captureMessages()).messages;
    },
    captureMessages,
    getAttachmentsMeta() {
      return turns().flatMap(({ el }) => attachmentsIn(el));
    },
    newChatUrl() {
      return new URL(config.newChatUrl, doc.location?.href ?? 'http://localhost/').href;
    },
    waitForComposer(timeoutMs = 10_000) {
      const now = findComposer();
      if (now) return Promise.resolve(now);
      return new Promise((resolveP) => {
        const obs = new MutationObserver(() => {
          const el = findComposer();
          if (el) {
            obs.disconnect();
            clearTimeout(timer);
            resolveP(el);
          }
        });
        obs.observe(doc.documentElement, { childList: true, subtree: true });
        const timer = setTimeout(() => {
          obs.disconnect();
          resolveP(null);
        }, timeoutMs);
      });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
