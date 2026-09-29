# Updating a site adapter

Chat sites change their markup often. Each site's selectors live in one file:

| Site    | Selectors                                   | Fixture                                                 |
| ------- | ------------------------------------------- | ------------------------------------------------------- |
| ChatGPT | `extension/src/adapters/configs/chatgpt.ts` | `fixtures/chatgpt.html`, `fixtures/chatgpt-legacy.html` |
| Claude  | `extension/src/adapters/configs/claude.ts`  | `fixtures/claude.html`                                  |
| Gemini  | `extension/src/adapters/configs/gemini.ts`  | `fixtures/gemini.html`                                  |

Each selector field is an ordered fallback list. The first selector that matches wins.

## Steps

1. On the broken site, open the Tessera panel, expand **Diagnostics** and copy the report. It shows
   which selector in each group matched and which failed.
2. In DevTools, find the new element and write a selector for it. Prefer stable hooks (`data-testid`,
   `aria-label`, `role`, custom element names) over generated class names.
3. Add the new selector at the **top** of the list in the config file. Keep the old one below it
   unless you are sure it is gone everywhere, because sites roll out redesigns gradually.
4. Save a trimmed copy of the relevant markup into the fixture (composer, one user turn, one
   assistant turn with a code block). Remove every piece of personal data. Update the table in
   `fixtures/README.md` with the date and whether it is a real capture.
5. Run `pnpm test`. Add a test if the change covers a case the fixture did not.

## What "the site accepted the text" means

`setComposerText` tries `execCommand('insertText')`, then a synthetic `beforeinput`, then a synthetic
paste (or the native value setter for a plain `<textarea>`). A strategy only counts when the text
reads back, the site's send button is enabled, and the text is still there after the editor has had
time to re-render. If all strategies fail, the panel says so and Diagnostics lists each attempt.
