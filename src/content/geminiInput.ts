import { focusWithoutScroll } from './focusWithoutScroll';
import { isUsableGeminiComposerInput, isVisibleGeminiElement } from './geminiDom';

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const PASTE_SETTLEMENT_TIMEOUT_MS = 1000;
const PASTE_SETTLEMENT_POLL_MS = 25;

export async function injectGeminiInput(
  input: Element,
  text: string,
  isActive: () => boolean = () => true,
): Promise<void> {
  assertCurrentEditor(input, isActive);
  if (geminiComposerMatches(input, text)) return;
  assertNoDifferentDraft(input);
  const editor = input as HTMLElement;
  focusWithoutScroll(editor);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection?.removeAllRanges();
  selection?.addRange(range);

  // The editor owns its selection and document model. Let it observe selection
  // before asking its paste handler to perform one plain-text edit.
  await nextTask();
  assertCurrentEditor(input, isActive);
  if (geminiComposerMatches(input, text)) return;
  assertNoDifferentDraft(input);
  const clipboard = new DataTransfer();
  clipboard.setData('text/plain', text);
  editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: clipboard,
    bubbles: true,
    cancelable: true,
    composed: true,
  }));

  // Reconciliation may take several tasks. Wait only by reading the live editor;
  // never patch visible DOM or replay an ignored paste with another insert.
  await nextTask();
  const deadline = Date.now() + PASTE_SETTLEMENT_TIMEOUT_MS;
  while (true) {
    assertCurrentEditor(input, isActive);
    if (geminiComposerMatches(input, text)) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('editor text did not match the requested prompt');
    await new Promise(resolve => setTimeout(resolve, Math.min(PASTE_SETTLEMENT_POLL_MS, remaining)));
  }
}

export function readGeminiComposerText(input: Element): string {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) return input.value;
  const nodes = Array.from(input.childNodes ?? []);
  if (!nodes.length) return input.textContent ?? '';
  const blocks = nodes.filter((node): node is Element => node.nodeType === 1);
  if (blocks.length === nodes.length && blocks.every(block => BLOCK_TAGS.has(block.tagName))) {
    return blocks.map(block => {
      const text = readInline(block);
      // A lone BR is the editor's empty-paragraph placeholder, not another line.
      return text === '\n' ? '' : text;
    }).join('\n');
  }
  return readInline(input);
}

export function geminiComposerMatches(input: Element, expected: string): boolean {
  const normalizeLineEndings = (value: string) => value.replace(/\r\n?/g, '\n');
  return normalizeLineEndings(readGeminiComposerText(input)) === normalizeLineEndings(expected);
}

function readInline(element: Element): string {
  let text = '';
  for (const child of Array.from(element.childNodes ?? [])) {
    if (child.nodeType === 3) text += child.textContent ?? '';
    else if (child.nodeType === 1) {
      const nested = child as Element;
      text += nested.tagName === 'BR' ? '\n' : readInline(nested);
    }
  }
  return text;
}

function assertNoDifferentDraft(input: Element): void {
  if (readGeminiComposerText(input).trim()) throw new Error('live editor contains a different draft');
}

function assertCurrentEditor(input: Element, isActive: () => boolean): void {
  if (!isActive()) throw new Error('request cancelled during input injection');
  if (input.isConnected === false) throw new Error('editor disconnected during input injection');
  if (!isUsableGeminiComposerInput(input as HTMLElement) || !isVisibleGeminiElement(input)) {
    throw new Error('editor unavailable during input injection');
  }
}

function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
