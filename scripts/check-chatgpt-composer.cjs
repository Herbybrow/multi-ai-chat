// Production content bundle in real Chromium DOM, with simulated Chrome transport.
// No provider network or account. Run after npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const account = '<button data-testid="accounts-profile-button">Profile</button>';
const editor = (attributes = '') => `<div class="ProseMirror" contenteditable="true" ${attributes}><p><br></p></div>`;
const form = (attributes = '') => `<form ${attributes}>${editor('data-target')}<button type="button" aria-label="Send" data-send>Send</button></form>`;
const scenarios = [
  { name: 'empty unmarked composer without Send', html: `<form>${editor('data-target')}</form>`, ready: true, send: true },
  { name: 'current marked composer', html: form('data-chatgpt-composer'), ready: true, send: true },
  { name: 'legacy composer', html: `<form>${editor('id="prompt-textarea" data-target')}<button type="button" data-testid="send-button" data-send>Send</button></form>`, ready: true, send: true },
  { name: 'inline message edit only', html: `<article data-testid="conversation-turn-1" data-message-author-role="user">${form()}</article>` },
  { name: 'dialog editor only', html: `<div role="dialog">${form()}</div>` },
  { name: 'search editor only', html: `<div role="search">${form()}</div>` },
  { name: 'navigation editor only', html: `<aside>${form()}</aside>` },
  { name: 'explicitly signed-out composer', html: '<button data-testid="login-button">Log in</button>' + form(), account: false },
  { name: 'ambiguous visible forms', html: form() + form() },
  { name: 'disabled editor', html: `<fieldset disabled>${form()}</fieldset>` },
  { name: 'inert editor', html: `<div inert>${form()}</div>` },
  { name: 'hidden legacy input plus live unmarked composer', html: editor('id="prompt-textarea" style="display:none"') + form(), ready: true, send: true },
  { name: 'unmarked composer beside inline edit', html: `<article>${form().replace('data-target', 'data-unrelated')}</article>` + form(), ready: true, send: true },
  { name: 'marked composer wins over unmarked form', html: form().replace('data-target', 'data-unrelated') + form('data-chatgpt-composer'), ready: true, send: true },
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATGPT_BROWSER });
  const report = { browser: browser.version(), evidence: 'Production ChatGPT bundle + isolated DOM/Chrome transport fixture; not authenticated provider verification', passed: [] };
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.setContent(`<style>[contenteditable]{min-height:30px}button{min-height:25px}</style>${scenario.account === false ? '' : account}${scenario.html}<div id="thread"></div>`);
        await page.evaluate(() => {
          const listeners = new Set();
          window.fixture = { messages: [], clicks: 0, unrelatedClicks: 0 };
          window.chrome = { runtime: {
            id: 'chatgpt-fixture',
            onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
            sendMessage: async message => { window.fixture.messages.push(message); },
          } };
          window.fixture.send = () => new Promise(resolve => {
            for (const listener of listeners) listener({ action: 'SEND_MESSAGE', provider: 'chatgpt', requestId: 'fixture-request', workflowId: 'fixture-workflow', payload: { text: 'COMPOSER_FIXTURE_OK' } }, {}, resolve);
          });
        });
        await page.addScriptTag({ path: path.resolve(__dirname, '../dist/content/chatgpt.js') });
        if (scenario.ready) {
          await page.waitForFunction(() => window.fixture.messages.some(m => m.action === 'STATUS_REPORT' && m.payload.loggedIn === true));
        } else {
          await page.waitForTimeout(2700); // Baseline readiness loss has a 2500 ms grace period.
          assert.equal(await page.evaluate(() => window.fixture.messages.some(m => m.action === 'STATUS_REPORT' && m.payload.loggedIn === true)), false, scenario.name);
        }
        if (scenario.send) {
          await page.evaluate(() => {
            const input = document.querySelector('[data-target]');
            const form = input.closest('form');
            if (!form.querySelector('[data-send]')) {
              const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', 'Send'); button.dataset.send = ''; form.append(button);
            }
            for (const button of document.querySelectorAll('[data-send]')) button.addEventListener('click', () => {
              if (button.closest('form') !== form) { window.fixture.unrelatedClicks++; return; }
              window.fixture.clicks++;
              window.fixture.accepted = input.textContent;
              input.replaceChildren(document.createElement('p'));
              document.querySelector('#thread').innerHTML = '<div data-message-author-role="user">COMPOSER_FIXTURE_OK</div><div data-message-author-role="assistant"><div class="markdown">Fixture response.</div></div>';
            });
          });
          assert.equal((await page.evaluate(() => window.fixture.send())).ok, true, scenario.name);
          await page.waitForFunction(() => window.fixture.messages.some(m => m.action === 'RESPONSE_DONE'), undefined, { timeout: 16000 });
          const result = await page.evaluate(() => window.fixture);
          assert.equal(result.clicks, 1, scenario.name);
          assert.equal(result.unrelatedClicks, 0, scenario.name);
          assert.equal(result.accepted, 'COMPOSER_FIXTURE_OK', scenario.name);
          assert.equal(result.messages.find(m => m.action === 'RESPONSE_DONE').payload, 'Fixture response.', scenario.name);
        }
        report.passed.push(scenario.name);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify(report, null, 2));
    if (process.env.CHATGPT_OUTPUT) fs.writeFileSync(process.env.CHATGPT_OUTPUT, JSON.stringify(report, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
