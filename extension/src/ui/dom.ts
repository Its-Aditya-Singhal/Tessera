/** Minimal DOM helpers shared by the extension pages and the in-page panel. */

type Attrs = Record<string, string | boolean | number | EventListener | undefined>;

/** Tiny DOM helper: h('button', { class: 'primary', onclick }, 'Save'). Text children are never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** replaceChildren that skips null/false entries from conditional sections. */
export function replaceKids(
  el: Element,
  ...kids: (Node | string | null | undefined | false)[]
): void {
  el.replaceChildren(
    ...kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false),
  );
}
