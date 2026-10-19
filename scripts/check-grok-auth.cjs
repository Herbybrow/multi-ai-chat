// Real Chromium DOM + production bundle; no account, external network or live AI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gate = '<div data-testid="anon-paywall-sign-up-card"><h2>Continue your conversation</h2><button>Sign up for free</button></div>';
const scenarios = [
  { name: 'visible guest gate', before: gate, blocked: true },
  { name: 'hidden guest gate', before: `<div hidden>${gate}</div>` },
  { name: 'transparent guest gate', before: gate.replace('data-testid=', 'style="opacity:0" data-testid=') },
  { name: 'ordinary signup link', before: '<a href="/sign-up">Sign up for free</a>' },
  { name: 'gate appears after send', before: '', send: true },
];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GROK_BROWSER });
  const report = { browser: browser.version(), evidence: 'Production Grok bundle with simulated Chrome transport and DOM', passed: [] };
  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      try {
        await page.setContent(`<form><textarea aria-label="Ask Grok anything"></textarea><button type="button" data-testid="chat-submit">Send</button></form><main>${scenario.before}</main>`);
        await page.evaluate(gate => {
          const listeners = new Set();
          window.fixture = { messages: [], clicks: 0 };
          window.chrome = { runtime: { id: 'grok-auth-fixture',
            onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
            sendMessage: async message => { window.fixture.messages.push(message); },
          } };
          window.fixture.send = () => new Promise(resolve => {
            for (const listener of listeners) listener({ action: 'SEND_MESSAGE', provider: 'grok', requestId: 'auth-request', workflowId: 'auth-workflow', payload: { text: 'Fixture prompt' } }, {}, resolve);
          });
          document.querySelector('button[data-testid="chat-submit"]').addEventListener('click', () => {
            window.fixture.clicks++;
            document.querySelector('main').insertAdjacentHTML('beforeend', gate);
            document.querySelector('form').remove();
          });
        }, gate);
        await page.addScriptTag({ path: path.resolve(__dirname, '../dist/content/grok.js') });
        const ready = await page.evaluate(() => window.fixture.messages.filter(m => m.action === 'STATUS_REPORT').at(-1)?.payload.loggedIn);
        assert.equal(ready, !scenario.blocked, scenario.name);
        if (scenario.blocked || scenario.send) {
          const ack = await page.evaluate(() => window.fixture.send());
          if (scenario.blocked) {
            assert.equal(ack.ok, false);
            assert.match(ack.error, /error.not_ready/);
          } else {
            assert.equal(ack.ok, true);
            await page.waitForFunction(() => window.fixture.messages.some(m => m.action === 'RESPONSE_DONE'));
            const messages = await page.evaluate(() => window.fixture.messages);
            assert.match(messages.find(m => m.action === 'RESPONSE_DONE').payload, /error.not_ready/);
            assert.equal(messages.filter(m => m.action === 'STATUS_REPORT').at(-1).payload.loggedIn, false);
            assert.equal(messages.filter(m => m.action === 'PROVIDER_REQUEST_STATE').at(-1).payload.submission, 'uncertain');
          }
          assert.equal(await page.evaluate(() => window.fixture.clicks), scenario.send ? 1 : 0);
        }
        report.passed.push(scenario.name);
      } finally { await page.close(); }
    }
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GROK_OUTPUT) fs.writeFileSync(process.env.GROK_OUTPUT, JSON.stringify(report, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
