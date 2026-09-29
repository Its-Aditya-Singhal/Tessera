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
  --t-warn: #8a5a00;
  --t-ins: #d7f5e0;
  --t-del: #fbe0de;
  --t-soft: #f3f5f8;
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
    --t-warn: #f2c265;
    --t-ins: #1f4d33;
    --t-del: #5a2622;
    --t-soft: #2a2d34;
    --t-focus: #9fb4ff;
  }
}
* { box-sizing: border-box; }
.fab {
  position: fixed;
  overflow: visible;
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
button:focus-visible, textarea:focus-visible, summary:focus-visible, input:focus-visible {
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

.fab.hint::after {
  content: '';
  position: absolute;
  top: -3px;
  right: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--t-warn);
  border: 2px solid var(--t-bg);
}
.head-actions { display: flex; gap: 2px; }
.tier { display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 999px; background: var(--t-soft); color: var(--t-muted); font-size: 11px; }
.tier:empty { display: none; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--t-border); margin: 4px 0 8px; }
.tab { border: none; background: transparent; color: var(--t-muted); font: inherit; font-weight: 600; padding: 6px 10px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab[aria-selected="true"] { color: var(--t-fg); border-bottom-color: var(--t-accent); }
.view[hidden] { display: none; }
.live { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; margin-top: 6px; min-height: 1em; }
.chip { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--t-soft); }
.chip:empty { display: none; }
.chip.ok { color: var(--t-ok); }
.chip.warn { color: var(--t-warn); }
ul.hints, ul.notes { margin: 0; padding-left: 18px; font-size: 12px; color: var(--t-muted); flex-basis: 100%; }
ul.notes { margin-top: 6px; }
.result:empty { display: none; }
.result { margin-top: 12px; border-top: 1px solid var(--t-border); padding-top: 10px; }
.verdict { padding: 6px 10px; border-radius: 8px; background: var(--t-soft); font-size: 13px; margin-bottom: 6px; border-left: 3px solid var(--t-muted); }
.verdict.ok { border-left-color: var(--t-ok); }
.verdict.improve { border-left-color: var(--t-accent); }
.verdict.ask { border-left-color: var(--t-warn); }
.questions .qa { margin-top: 6px; }
.questions label { font-weight: 500; margin: 4px 0 2px; }
input.q { width: 100%; font: inherit; color: var(--t-fg); background: transparent; border: 1px solid var(--t-border); border-radius: 8px; padding: 6px 8px; }
.diff { white-space: pre-wrap; word-break: break-word; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; border: 1px solid var(--t-border); border-radius: 8px; padding: 8px; max-height: 260px; overflow: auto; margin-top: 8px; }
.diff ins { background: var(--t-ins); text-decoration: none; }
.diff del { background: var(--t-del); text-decoration: line-through; opacity: 0.8; }
textarea.edit { margin-top: 8px; min-height: 140px; }
h3 { font-size: 13px; margin: 10px 0 4px; }
.changes ul { margin: 0; padding-left: 18px; font-size: 13px; }
.issues { margin-top: 8px; padding: 6px 10px; border-radius: 8px; background: var(--t-del); font-size: 12px; }
details.privacy { margin-top: 10px; }
ul.rows { list-style: none; padding: 0; margin: 6px 0 0; max-height: 160px; overflow: auto; }
.rowlabel { display: flex; align-items: center; gap: 6px; font-weight: 400; margin: 2px 0; font-size: 12px; cursor: pointer; }
.ph { font: 11px ui-monospace, monospace; background: var(--t-soft); padding: 0 4px; border-radius: 4px; }
.val { color: var(--t-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.maybe { font-size: 10px; color: var(--t-warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 5px; }
.footer-row { border-top: 1px solid var(--t-border); padding-top: 10px; margin-top: 12px; }
.toast {
  position: fixed;
  z-index: 2147483647;
  width: 320px;
  background: var(--t-bg);
  color: var(--t-fg);
  border: 1px solid var(--t-border);
  border-left: 3px solid var(--t-warn);
  border-radius: 10px;
  box-shadow: var(--t-shadow);
  padding: 10px 12px;
  font-size: 13px;
  transform: translateY(-100%);
}
.toast[hidden] { display: none; }
.toast p { margin: 0; }
.toast .row { margin-top: 8px; }
select, input[type="number"] { font: inherit; color: var(--t-fg); background: var(--t-bg); border: 1px solid var(--t-border); border-radius: 8px; padding: 4px 8px; }
.preview { white-space: pre-wrap; word-break: break-word; font: 12px/1.45 ui-monospace, monospace; border: 1px solid var(--t-border); border-radius: 8px; padding: 8px; max-height: 240px; overflow: auto; margin-top: 8px; }
.meta { font-size: 12px; color: var(--t-muted); margin-top: 6px; }
@media (prefers-reduced-motion: no-preference) {
  .panel { animation: t-in 120ms ease-out; }
  @keyframes t-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
}
.linkish { border: none; background: none; color: var(--t-accent); font: inherit; font-size: 12px; padding: 0; margin-top: 6px; cursor: pointer; text-decoration: underline; }
.grid2 { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; margin-top: 8px; }
.grid2 label { margin: 0; }
.transfer-out:empty { display: none; }
.transfer-out { margin-top: 10px; border-top: 1px solid var(--t-border); padding-top: 8px; }
p.issues { margin: 6px 0; }
`;
