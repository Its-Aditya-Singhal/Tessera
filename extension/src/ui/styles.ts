/** Styles for the in-page UI. Scoped by the shadow root, so page CSS cannot reach in or out. */
export const PANEL_CSS = `
:host {
  all: initial;
  --t-bg: #ffffff;
  --t-fg: #1b1d21;
  --t-muted: #5d6370;
  --t-border: #d9dce2;
  --t-accent: #2f5bd3;
  --t-accent-fg: #ffffff;
  --t-ok: #1e7b45;
  --t-bad: #b3261e;
  --t-focus: #2f5bd3;
  --t-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  color: var(--t-fg);
}
@media (prefers-color-scheme: dark) {
  :host {
    --t-bg: #1f2126;
    --t-fg: #eceef2;
    --t-muted: #a3a9b5;
    --t-border: #3a3e47;
    --t-accent: #7d9bff;
    --t-accent-fg: #0e1220;
    --t-ok: #6fd39a;
    --t-bad: #ff8a80;
    --t-focus: #9fb4ff;
  }
}
* { box-sizing: border-box; }
.fab {
  position: fixed;
  z-index: 2147483646;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--t-border);
  background: var(--t-bg);
  color: var(--t-accent);
  box-shadow: var(--t-shadow);
  cursor: pointer;
  display: grid;
  place-items: center;
  font: 600 14px/1 system-ui, sans-serif;
  padding: 0;
}
.fab[hidden] { display: none; }
button:focus-visible, textarea:focus-visible, summary:focus-visible {
  outline: 2px solid var(--t-focus);
  outline-offset: 2px;
}
.panel {
  position: fixed;
  z-index: 2147483647;
  right: 16px;
  bottom: 16px;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: var(--t-bg);
  color: var(--t-fg);
  border: 1px solid var(--t-border);
  border-radius: 12px;
  box-shadow: var(--t-shadow);
  padding: 14px 16px 16px;
}
.panel[hidden] { display: none; }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
h2 { font-size: 15px; margin: 0; }
.site { color: var(--t-muted); font-size: 12px; }
label { display: block; font-weight: 600; margin: 8px 0 4px; }
textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--t-fg);
  background: transparent;
  border: 1px solid var(--t-border);
  border-radius: 8px;
  padding: 8px;
}
.row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.btn {
  border: 1px solid var(--t-border);
  background: transparent;
  color: var(--t-fg);
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
}
.btn.primary { background: var(--t-accent); border-color: var(--t-accent); color: var(--t-accent-fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.icon { border: none; background: transparent; color: var(--t-muted); font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.status { min-height: 1.4em; margin-top: 8px; font-size: 13px; }
.status.ok { color: var(--t-ok); }
.status.bad { color: var(--t-bad); }
details { margin-top: 12px; border-top: 1px solid var(--t-border); padding-top: 8px; }
summary { cursor: pointer; font-weight: 600; }
pre.diag { white-space: pre-wrap; word-break: break-all; font: 11px/1.4 ui-monospace, monospace; color: var(--t-muted); max-height: 220px; overflow: auto; }
.note { font-size: 12px; color: var(--t-muted); margin: 4px 0 0; }
`;
