import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

for (const provider of ['claude', 'gemini']) {
  test(`${provider}: missing composer is unknown, not evidence of logout`, () => {
    let config: any;
    let composer: object | null = null;
    const source = readFileSync(new URL(`../src/content/${provider}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(compiled, {
      exports: {},
      require: (name: string) => {
        assert.equal(name, './base');
        return { createContentScript: (value: unknown) => { config = value; } };
      },
      document: { querySelector: () => composer },
    });
    assert.equal(config.provider, provider);
    assert.equal(config.loginDetector(), null, 'loading, removed or quota-gated markup must not imply authentication failure');
    composer = {};
    assert.equal(config.loginDetector(), true);
    composer = null;
    assert.equal(config.loginDetector(), null, 'losing an existing composer must remain unknown');
  });
}
