// A stand-in for a chatbot page, used by the e2e tests.
//
// The default editor behaves like ProseMirror: it keeps its own model, updates it
// from `beforeinput`, `paste`, and from the DOM after a native `input` event (the
// way ProseMirror's DOM observer reads browser edits), and re-renders its DOM
// from that model. Writing to the DOM directly without events therefore does not
// stick, which is exactly what makes injecting text into real chat sites hard.
//
// Query params:
//   editor=pm (default) | textarea | paste-only (ignores typed/execCommand input) | broken
//   history=N   number of older turns to lazy-load when scrolled to the top
(() => {
  const params = new URLSearchParams(location.search);
  const mode = params.get('editor') || 'pm';
  const historyCount = Number(params.get('history') || '0');
  const form = document.getElementById('composer');
  const thread = document.getElementById('thread');

  let text = '';
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'Send';
  send.disabled = true;

  let editor;
  const render = () => {
    send.disabled = text.trim() === '';
    if (mode === 'textarea') {
      if (editor.value !== text) editor.value = text;
      return;
    }
    const lines = text.split('\n');
    const html = lines.map((l) => (l ? `<p>${escapeHtml(l)}</p>` : '<p><br></p>')).join('');
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
      placeCaretAtEnd(editor);
    }
  };

  if (mode === 'textarea') {
    editor = document.createElement('textarea');
    // Like a React controlled input: state follows `input` events only.
    editor.addEventListener('input', () => {
      text = editor.value;
      render();
    });
  } else {
    editor = document.createElement('div');
    editor.className = 'editor ProseMirror';
    editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox');
    const allSelected = () => {
      const sel = getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const r = sel.getRangeAt(0);
      return (
        sel.toString().replace(/\n/g, '') === text.replace(/\n/g, '') ||
        (r.collapsed && text === '')
      );
    };
    const apply = (inserted) => {
      text = allSelected() ? inserted : text + inserted;
      render();
    };
    editor.addEventListener('beforeinput', (ev) => {
      ev.preventDefault();
      if (mode === 'broken') return;
      if (mode === 'paste-only' && ev.inputType !== 'insertFromPaste') return;
      switch (ev.inputType) {
        case 'insertText':
        case 'insertReplacementText':
          apply(ev.data ?? ev.dataTransfer?.getData('text/plain') ?? '');
          break;
        case 'insertFromPaste':
          apply(ev.dataTransfer?.getData('text/plain') ?? '');
          break;
        case 'insertParagraph':
        case 'insertLineBreak':
          apply('\n');
          break;
        case 'deleteContentBackward':
        case 'deleteContentForward':
        case 'deleteByCut':
          text = allSelected() ? '' : text.slice(0, -1);
          render();
          break;
      }
    });
    // execCommand does not fire `beforeinput`; like ProseMirror, read the DOM it changed.
    editor.addEventListener('input', () => {
      if (mode !== 'pm') return;
      text = Array.from(editor.children, (p) => p.textContent).join('\n');
      render();
    });
    editor.addEventListener('paste', (ev) => {
      ev.preventDefault();
      if (mode === 'broken') return;
      apply(ev.clipboardData?.getData('text/plain') ?? '');
    });
    // Anything that slipped past the model (direct DOM edits) is undone on the next render.
    setInterval(render, 100);
  }

  form.append(editor, send);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    addTurn('user', text, false);
    text = '';
    render();
  });
  render();

  function addTurn(role, body, prepend, extra = '') {
    const div = document.createElement('div');
    div.className = 'turn';
    div.dataset.role = role;
    div.innerHTML = `<span class="sr-only">${role === 'user' ? 'You said' : 'Bot said'}</span>${extra}<div class="body"></div><button type="button">Copy</button>`;
    div.querySelector('.body').textContent = body;
    if (prepend) thread.prepend(div);
    else thread.append(div);
    return div;
  }

  // Seed a short conversation, including a code block and an attachment.
  addTurn(
    'user',
    'How do I reverse a list in Python?',
    false,
    '<span class="attachment" data-type="text/csv" title="data.csv">data.csv</span>',
  );
  const answer = addTurn('assistant', '', false);
  answer.querySelector('.body').innerHTML =
    '<p>Use slicing:</p><pre><code class="language-python">items = [1, 2, 3]\nprint(items[::-1])  # [3, 2, 1]\n</code></pre><p>Or <code>list.reverse()</code> in place.</p>';

  // Lazy-load older turns when the thread is scrolled to the top, a few at a time.
  let remaining = historyCount;
  thread.addEventListener('scroll', () => {
    if (thread.scrollTop > 0 || remaining <= 0) return;
    setTimeout(() => {
      for (let i = 0; i < 5 && remaining > 0; i++, remaining--) {
        addTurn(remaining % 2 ? 'assistant' : 'user', `Older message ${remaining}`, true);
      }
    }, 50);
  });

  window.__mock = {
    getText: () => text,
    isSendEnabled: () => !send.disabled,
    remainingHistory: () => remaining,
  };

  function escapeHtml(s) {
    return s.replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  }
  function placeCaretAtEnd(el) {
    if (document.activeElement !== el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
})();
