import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { captureSemanticResponseBaseline, currentSemanticResponseText } from '../src/content/responseTracking.ts';
import { extractResponseContent } from '../src/content/responseSerializer.ts';

// Run the real Gemini adapter against a controlled editor that reconciles on a
// later task. textContent intentionally concatenates Quill paragraph children.
function inputHarness() {
  const events: any[] = [];
  const selected: unknown[] = [];
  let selectionObserved = false;
  let config: any;
  class Editor {
    nodeType = 1;
    tagName = 'DIV';
    childNodes: any[] = [];
    isConnected = true;
    isContentEditable = true;
    disabled = false;
    readOnly = false;
    visible = true;
    inRichTextarea = true;
    qlEditor = true;
    onEvent: (event: any) => void = () => {};
    get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
    get innerText() { return this.childNodes.map(child => readInline(child)).join('\n'); }
    focus() {}
    getClientRects() { return this.visible ? [{}] : []; }
    getAttribute(name: string) { return name === 'contenteditable' ? 'true' : null; }
    matches(selector: string) { return selector.includes('.ql-editor') && this.qlEditor; }
    closest(selector: string) {
      if (selector.includes('rich-textarea')) return this.inRichTextarea ? {} : null;
      return null;
    }
    dispatchEvent(event: any) { events.push(event); this.onEvent(event); return !event.defaultPrevented; }
    replaceChildren() { throw new Error('must not replace editor-owned DOM'); }
    appendChild() { throw new Error('must not append editor-owned DOM'); }
    commit(text: string) { this.childNodes = text.split('\n').map(paragraph); }
  }
  class Transfer {
    data = new Map<string, string>();
    setData(type: string, value: string) { this.data.set(type, value); }
    getData(type: string) { return this.data.get(type) ?? ''; }
  }
  class ClipboardEvent extends Event {
    clipboardData: Transfer;
    constructor(type: string, options: any) { super(type, options); this.clipboardData = options.clipboardData; }
  }
  const context = vm.createContext({
    HTMLElement: Editor, HTMLInputElement: class {}, HTMLTextAreaElement: class {},
    DataTransfer: Transfer, ClipboardEvent, Event, setTimeout,
    window: {
      getComputedStyle: (element: Editor) => ({ display: element.visible ? 'block' : 'none', visibility: 'visible', opacity: '1' }),
      getSelection: () => ({
        removeAllRanges() {},
        addRange() { setTimeout(() => { selectionObserved = true; }, 0); },
      }),
    },
    document: {
      createRange: () => ({ selectNodeContents: (editor: unknown) => selected.push(editor) }),
      execCommand() { throw new Error('must not replay an insert with execCommand'); },
    },
  });
  const cache = new Map<string, any>();
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function(require, module, exports) {${code}\n})`, context)(
      (relative: string) => relative === './base'
        ? { createContentScript: (value: any) => { config = value; } }
        : load(path.resolve(path.dirname(file), `${relative}.ts`)), module, module.exports,
    );
    return module.exports;
  }
  load(fileURLToPath(new URL('../src/content/gemini.ts', import.meta.url)));
  return { config, Editor, events, selected, selectionObserved: () => selectionObserved };
}

test('Gemini commits one plain-text paste through its editor before verification', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  const text = 'First line\n\nUse "a  b" + 2\nمرحبا 👩‍💻\n中文 ✓';
  editor.onEvent = event => {
    assert.equal(app.selectionObserved(), true);
    event.preventDefault();
    setTimeout(() => editor.commit(event.clipboardData.getData('text/plain')), 0);
  };
  await app.config.injectInput(editor, text);
  assert.equal(editor.textContent.includes('\n'), false);
  assert.equal(app.config.readInputText(editor), text);
  assert.equal(app.config.inputMatchesPrompt(editor, text), true);
  assert.deepEqual(app.events.map(event => event.type), ['paste']);
  assert.equal(app.events[0].clipboardData.getData('text/html'), '');
  assert.equal(app.events[0].bubbles && app.events[0].cancelable && app.events[0].composed, true);
});

test('Gemini waits for a legitimate paste commit delayed by 40ms without replaying it', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  const text = 'Delayed\n\nمرحبا 👩‍💻';
  editor.onEvent = event => {
    event.preventDefault();
    setTimeout(() => editor.commit(event.clipboardData.getData('text/plain')), 40);
  };
  await app.config.injectInput(editor, text);
  assert.equal(app.config.readInputText(editor), text);
  assert.deepEqual(app.events.map(event => event.type), ['paste']);
});

test('Gemini cancellation during paste settlement stops verification without replay', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  let active = true;
  editor.onEvent = event => {
    event.preventDefault();
    setTimeout(() => { active = false; }, 15);
    setTimeout(() => editor.commit(event.clipboardData.getData('text/plain')), 100);
  };
  await assert.rejects(() => app.config.injectInput(editor, 'old prompt', () => active), /request cancelled/);
  assert.deepEqual(app.events.map(event => event.type), ['paste']);
});

test('Gemini rejects an ignored paste without direct DOM or replay fallback', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  editor.onEvent = event => event.preventDefault();
  await assert.rejects(() => app.config.injectInput(editor, 'requested prompt'), /editor text did not match the requested prompt/);
  assert.equal(editor.textContent, '');
  assert.deepEqual(app.events.map(event => event.type), ['paste']);
});

test('Gemini preserves an unrelated existing draft including significant quoted spaces', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  editor.commit('Use "a b"');
  await assert.rejects(() => app.config.injectInput(editor, 'Use "ab"'), /different draft/);
  assert.equal(editor.textContent, 'Use "a b"');
  assert.equal(app.events.length, 0);
});

test('Gemini already matching draft is verified without another paste', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  editor.commit('existing\n\nprompt');
  await app.config.injectInput(editor, 'existing\n\nprompt');
  assert.equal(app.events.length, 0);
});

test('Gemini cancellation before paste prevents an obsolete editor edit', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  let active = true;
  const injection = app.config.injectInput(editor, 'old prompt', () => active);
  active = false;
  await assert.rejects(() => injection, /request cancelled/);
  assert.equal(app.events.length, 0);
});

test('Gemini controlled reconciliation cannot leave an unverified visual draft ready to send', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  editor.onEvent = event => {
    event.preventDefault();
    editor.commit(event.clipboardData.getData('text/plain'));
    setTimeout(() => editor.commit(''), 0);
  };
  await assert.rejects(() => app.config.injectInput(editor, 'requested prompt'), /editor text did not match the requested prompt/);
  assert.equal(editor.textContent, '');
  assert.deepEqual(app.events.map(event => event.type), ['paste']);
});

test('Gemini skips a composer that becomes disabled while selection reconciles', async () => {
  const app = inputHarness();
  const editor = new app.Editor();
  const injection = app.config.injectInput(editor, 'requested prompt');
  editor.disabled = true;
  await assert.rejects(() => injection, /editor unavailable/);
  assert.equal(app.events.length, 0);
});

test('Gemini serializer preserves inline breaks, blank paragraphs, CRLF and literal whitespace', () => {
  const app = inputHarness();
  const editor = new app.Editor();
  editor.childNodes = [
    { nodeType: 1, tagName: 'P', textContent: 'firstsecond', childNodes: [
      { nodeType: 3, textContent: 'first' },
      { nodeType: 1, tagName: 'BR', textContent: '', childNodes: [] },
      { nodeType: 3, textContent: 'second' },
    ] },
    paragraph(''), paragraph('Use "a  b"\t👩‍💻'),
  ];
  const expected = 'first\nsecond\n\nUse "a  b"\t👩‍💻';
  assert.equal(app.config.readInputText(editor), expected);
  assert.equal(app.config.inputMatchesPrompt(editor, expected.replace(/\n/g, '\r\n')), true);
  assert.equal(app.config.inputMatchesPrompt(editor, expected.replace('a  b', 'a b')), false);
  assert.equal(app.config.inputMatchesPrompt(editor, expected.replace('\n\n', '\n')), false);
});

test('Gemini adapter uses visible usable composers and one activation without draft-clear confirmation', () => {
  const app = inputHarness();
  assert.equal(app.config.requireVisibleInput, true);
  assert.equal(app.config.preserveExistingDraft, true);
  assert.equal(app.config.sendConfirmation, 'single-activation');
  const unrelated = new app.Editor(); unrelated.qlEditor = false; unrelated.inRichTextarea = false;
  assert.equal(app.config.inputFilter(unrelated), false);
  const disabled = new app.Editor(); disabled.disabled = true;
  assert.equal(app.config.inputFilter(disabled), false);
  const hidden = new app.Editor(); hidden.visible = false;
  assert.equal(app.config.inputFilter(hidden), false);
  const send = new app.Editor(); send.tagName = 'BUTTON';
  assert.equal(app.config.sendButtonFilter(send), true);
  send.visible = false;
  assert.equal(app.config.sendButtonFilter(send), false);
});

test('Gemini semantic responses ignore remounted old Markdown and serialize the new answer', () => {
  const app = inputHarness();
  assert.equal(app.config.responseTracking, 'semantic-latest');
  assert.equal(app.config.responseSelectors[0], '.model-response-text .markdown');
  const previous = new app.Editor(); previous.commit('previous answer');
  const baseline = captureSemanticResponseBaseline([previous], extractResponseContent);
  const remounted = new app.Editor(); remounted.commit('previous answer');
  assert.equal(currentSemanticResponseText([remounted], baseline, extractResponseContent), null);
  const current = new app.Editor();
  current.childNodes = [paragraph('New answer ✓'), paragraph('مرحبا 👩‍💻'),
    { nodeType: 1, tagName: 'BUTTON', textContent: 'Copy', childNodes: [{ nodeType: 3, textContent: 'Copy' }] }];
  assert.equal(
    currentSemanticResponseText([remounted, current], baseline, extractResponseContent),
    'New answer ✓\n\nمرحبا 👩‍💻',
  );
});

function paragraph(text: string) {
  return { nodeType: 1, tagName: 'P', textContent: text, childNodes: text
    ? [{ nodeType: 3, textContent: text }]
    : [{ nodeType: 1, tagName: 'BR', textContent: '', childNodes: [] }] };
}

function readInline(node: any): string {
  if (node.nodeType === 3) return node.textContent;
  if (node.tagName === 'BR') return '';
  return node.childNodes.map(readInline).join('');
}
