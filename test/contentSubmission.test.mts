import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test, { type TestContext } from 'node:test';
import ts from 'typescript';

function content(t: TestContext, options: {
  strict?: boolean;
  draft?: string;
  inputAvailable?: boolean;
  sendAvailable?: boolean;
  disabled?: boolean;
  clearOnClick?: boolean;
  deferFirstInjection?: boolean;
  useGrokAdapter?: boolean;
} = {}) {
  let now = 10000;
  let timerId = 0;
  const pending = new Map<number, { callback: () => void; at: number; interval?: number }>();
  const schedule = (callback: () => void, delay: number, repeat = false) => {
    const id = ++timerId;
    pending.set(id, { callback, at: now + delay, interval: repeat ? delay : undefined });
    return id;
  };
  const timers = {
    setTimeout: (callback: () => void, delay: number) => schedule(callback, delay),
    setInterval: (callback: () => void, delay: number) => schedule(callback, delay, true),
    clearTimeout: (id: number) => { pending.delete(id); },
    clearInterval: (id: number) => { pending.delete(id); },
  };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms: number) {
    const until = now + ms;
    while (true) {
      await flush();
      const next = [...pending].filter(([, timer]) => timer.at <= until)
        .sort(([idA, a], [idB, b]) => a.at - b.at || idA - idB)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval !== undefined) timer.at += timer.interval;
      else pending.delete(id);
      timer.callback();
    }
    now = until;
    await flush();
  }
  let listener: Function;
  let mutation: Function;
  let clicks = 0;
  let enters = 0;
  let injections = 0;
  let stopAvailable = false;
  let stopClicks = 0;
  let inputAvailable = options.inputAvailable ?? true;
  let sendAvailable = options.sendAvailable ?? true;
  let releaseInjection: (() => void) | undefined;
  const messages: any[] = [];
  class Element {
    textContent = '';
    nodeType = 1;
    tagName = 'DIV';
    disabled = false;
    isConnected = true;
    focus() { document.activeElement = this; }
    closest() { return null; }
    getAttribute() { return null; }
    hasAttribute() { return false; }
    getClientRects() { return [{}]; }
    dispatchEvent(event: { type: string }) { if (event.type === 'keydown') enters++; return true; }
    compareDocumentPosition() { return 4; }
  }
  class Textarea extends Element { value = ''; }
  let input = Object.assign(new Textarea(), { value: options.draft ?? '' });
  const send = Object.assign(new Element(), {
    disabled: options.disabled ?? false,
    click() { clicks++; if (options.clearOnClick) input.value = ''; },
  });
  const stop = Object.assign(new Element(), { click() { stopClicks++; stopAvailable = false; } });
  const users: Element[] = [];
  const responses: Element[] = [];
  const document = {
    body: {}, activeElement: input as Element,
    querySelectorAll(selector: string) {
      if (selector === '#input') return inputAvailable ? [input] : [];
      if (selector === '#send') return sendAvailable ? [send] : [];
      if (selector === '#stop') return stopAvailable ? [stop] : [];
      if (selector === '#user') return users;
      if (selector === '#answer') return responses;
      return [];
    },
  };
  const window = { ...timers, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } as any;
  const context = vm.createContext({
    window, document, ...timers, Date: class extends Date { static now() { return now; } },
    HTMLElement: Element, HTMLTextAreaElement: Textarea, HTMLInputElement: class extends Element {},
    KeyboardEvent: class { type: string; constructor(type: string) { this.type = type; } },
    MutationObserver: class {
      constructor(callback: Function) { mutation = callback; }
      observe() {} disconnect() {}
    },
    chrome: { runtime: {
      id: 'test', sendMessage: async (message: any) => { messages.push(message); },
      onMessage: { addListener(callback: Function) { listener = callback; }, removeListener() {} },
    } },
  });
  const cache = new Map<string, any>();
  let captureAdapter = false;
  let adapterConfig: any;
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function(require, module, exports) {${code}\n})`, context)(
      (relative: string) => captureAdapter && relative === './base'
        ? { createContentScript: (config: any) => { adapterConfig = config; } }
        : load(path.resolve(path.dirname(file), `${relative}.ts`)), module, module.exports,
    );
    return module.exports;
  }
  if (options.useGrokAdapter) {
    captureAdapter = true;
    load(fileURLToPath(new URL('../src/content/grok.ts', import.meta.url)));
    captureAdapter = false;
  }
  load(fileURLToPath(new URL('../src/content/base.ts', import.meta.url))).createContentScript({
    ...adapterConfig,
    provider: 'grok', inputSelectors: ['#input'], sendButtonSelectors: ['#send'],
    userMessageSelectors: ['#user'], userMessageTracking: 'semantic-count',
    sendConfirmation: options.useGrokAdapter ? adapterConfig.sendConfirmation
      : options.strict === false ? 'heuristic' : 'matching-user-message',
    requireSameComposerForClearConfirmation: true,
    responseSelectors: ['#answer'], responseTracking: 'semantic-latest',
    stopButtonSelectors: ['#stop'], stopButtonFilter: () => true,
    requireMatchingUserMessageForGenerationSignals: true,
    anchorSemanticResponsesAfterMatchingUserMessage: true,
    inputFilter: () => true, sendButtonFilter: () => true, isThinking: () => false,
    loginDetector: () => true,
    injectInput: (editor: Textarea, text: string) => {
      injections++; editor.value = text;
      if (options.deferFirstInjection && injections === 1) {
        return new Promise<void>(resolve => { releaseInjection = resolve; });
      }
    },
    doneDelay: 1000, chunkDebounce: 0,
  });
  t.after(() => window.__multiAiChat_grok.dispose());
  const command = (message: any): Promise<any> => new Promise(resolve => listener(message, {}, resolve));
  return {
    advance, flush,
    send: (requestId = 'request', text = 'prompt') => command({
      action: 'SEND_MESSAGE', provider: 'grok', requestId, workflowId: 'workflow', payload: { text },
    }),
    stop: (requestId = 'request') => command({
      action: 'STOP_GENERATION', provider: 'grok', requestId, workflowId: 'workflow',
    }),
    inputReady() { inputAvailable = true; },
    replaceComposer(draft = '') { input.isConnected = false; input = Object.assign(new Textarea(), { value: draft }); },
    releaseInjection() { releaseInjection?.(); },
    showStop() { stopAvailable = true; },
    stopClicks: () => stopClicks,
    accepted(text = 'prompt') { users.push(Object.assign(new Element(), { textContent: text })); mutation(); },
    answer(text: string) { responses.push(Object.assign(new Element(), { textContent: text })); mutation(); },
    counts: () => ({ clicks, enters, injections }),
    draft: () => input.value,
    done: () => messages.filter(message => message.action === 'RESPONSE_DONE'),
  };
}

test('Grok preserves a different existing draft without activating submission', async t => {
  const app = content(t, { draft: 'my unfinished draft' });
  assert.equal((await app.send()).ok, false);
  await app.advance(15000);
  assert.equal(app.draft(), 'my unfinished draft');
  assert.deepEqual(app.counts(), { clicks: 0, enters: 0, injections: 0 });
  assert.match(app.done()[0]?.payload, /error.existing_draft/);
});

test('Grok preserves significant whitespace in a different existing draft', async t => {
  const app = content(t, { draft: 'Use "a b"' });
  assert.equal((await app.send('request', 'Use "ab"')).ok, false);
  await app.advance(15000);
  assert.equal(app.draft(), 'Use "a b"');
  assert.deepEqual(app.counts(), { clicks: 0, enters: 0, injections: 0 });
  assert.match(app.done()[0]?.payload, /error.existing_draft/);
});

test('Grok attempts one activation and reports uncertainty while preserving its draft', async t => {
  const app = content(t);
  assert.equal((await app.send()).ok, true);
  await app.advance(15000);
  assert.deepEqual(app.counts(), { clicks: 1, enters: 0, injections: 1 });
  assert.equal(app.draft(), 'prompt');
  assert.equal(app.done().length, 1);
  assert.match(app.done()[0].payload, /error.send_unconfirmed/);
});

test('the actual Grok adapter opts into confirmed single-activation submission', async t => {
  const app = content(t, { useGrokAdapter: true });
  await app.send(); await app.advance(15000);
  assert.deepEqual(app.counts(), { clicks: 1, enters: 0, injections: 1 });
  assert.match(app.done()[0]?.payload, /error.send_unconfirmed/);
});

test('clearing the same Grok composer cannot confirm acceptance', async t => {
  const app = content(t, { clearOnClick: true });
  await app.send();
  await app.advance(15000);
  assert.deepEqual(app.counts(), { clicks: 1, enters: 0, injections: 1 });
  assert.match(app.done()[0]?.payload, /error.send_unconfirmed/);
});

test('an empty replacement after Grok activation is not reinjected or replayed', async t => {
  const app = content(t);
  await app.send(); await app.advance(800);
  app.replaceComposer();
  await app.advance(15000);
  assert.deepEqual(app.counts(), { clicks: 1, enters: 0, injections: 1 });
  assert.equal(app.draft(), '');
  assert.match(app.done()[0]?.payload, /error.send_unconfirmed/);
});

test('Grok accepts a late matching user turn without replaying submission', async t => {
  const app = content(t);
  await app.send(); await app.advance(5000);
  app.accepted(); app.answer('complete answer');
  await app.advance(15000);
  assert.deepEqual(app.counts(), { clicks: 1, enters: 0, injections: 1 });
  assert.equal(app.done().length, 1);
  assert.equal(app.done()[0].payload, 'complete answer');
});

for (const state of ['disabled', 'unavailable'] as const) {
  test(`Grok ${state} send control does not fall through to Enter`, async t => {
    const app = content(t, { disabled: state === 'disabled', sendAvailable: state !== 'unavailable' });
    await app.send(); await app.advance(15000);
    assert.deepEqual(app.counts(), { clicks: 0, enters: 0, injections: 1 });
    assert.equal(app.draft(), 'prompt');
    assert.match(app.done()[0]?.payload, new RegExp(`error.send_action_${state}`));
  });
}

test('scoped cancellation during initial lookup prevents later injection and completion', async t => {
  const app = content(t, { inputAvailable: false });
  const pending = app.send(); await app.flush();
  assert.equal((await app.stop()).ok, true);
  app.inputReady(); await app.advance(15000);
  assert.equal((await pending).ok, false);
  assert.deepEqual(app.counts(), { clicks: 0, enters: 0, injections: 0 });
  assert.equal(app.done().length, 0);
});

for (const newId of ['new', 'old']) {
  test(`an obsolete injection cannot settle a newer generation with request ID ${newId}`, async t => {
    const app = content(t, { strict: false, deferFirstInjection: true });
    const old = app.send('old', 'old prompt'); await app.flush();
    assert.equal((await app.stop('old')).ok, true);
    assert.equal((await app.send(newId, 'new prompt')).ok, true);
    app.releaseInjection(); await app.flush();
    assert.equal((await old).ok, false);
    assert.equal(app.done().length, 0);
    assert.equal((await app.stop(newId)).ok, true);
  });
}

test('concurrent SEND rejects the second request before injection', async t => {
  const app = content(t, { strict: false });
  const [first, second] = await Promise.all([app.send('first'), app.send('second', 'other prompt')]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.match(second.error, /error.response_in_progress/);
  assert.equal(app.counts().injections, 1);
  assert.equal(app.done().length, 0);
});

test('cancelled Grok submission can stop a stream that starts after cancellation', async t => {
  const app = content(t);
  await app.send(); await app.advance(800);
  assert.equal((await app.stop()).ok, true);
  app.showStop();
  assert.equal((await app.stop()).ok, true);
  assert.equal(app.stopClicks(), 1);
  app.accepted(); app.answer('late cancelled response');
  await app.advance(15000);
  assert.equal(app.done().length, 0);
});

test('cancelled Grok submission performs bounded cleanup when its Stop control appears late', async t => {
  const app = content(t);
  await app.send(); await app.advance(800); await app.stop();
  app.showStop(); await app.advance(500);
  assert.equal(app.stopClicks(), 1);
  assert.equal(app.done().length, 0);
});

for (const newId of ['new', 'request']) {
  test(`cancelled Grok cleanup cannot stop a newer generation with request ID ${newId}`, async t => {
    const app = content(t);
    await app.send(); await app.advance(800); await app.stop();
    await app.send(newId); await app.advance(800);
    app.showStop(); await app.advance(500);
    assert.equal(app.stopClicks(), 0);
    assert.equal((await app.stop(newId)).ok, true);
    assert.equal(app.stopClicks(), 1);
  });
}

test('cancelled Grok cleanup stops polling at its bound while retaining exact scoped Stop', async t => {
  const app = content(t);
  await app.send(); await app.advance(800); await app.stop();
  await app.advance(15000);
  app.showStop(); await app.advance(1000);
  assert.equal(app.stopClicks(), 0);
  assert.equal((await app.stop()).ok, true);
  assert.equal(app.stopClicks(), 1);
});

test('unconfirmed Grok failure retains an exact scoped Stop for an orphan stream', async t => {
  const app = content(t);
  await app.send(); await app.advance(15000);
  assert.match(app.done()[0]?.payload, /error.send_unconfirmed/);
  app.showStop();
  assert.equal((await app.stop()).ok, true);
  assert.equal(app.stopClicks(), 1);
});
