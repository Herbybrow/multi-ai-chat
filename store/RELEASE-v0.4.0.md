# Multi-AI Chat v0.4.0

v0.4.0 improves provider compatibility, preserves workflow progress across background restarts, and separates the requested answer language from the interface language.

## Changes

- **Workflow recovery:** saves completed turns and pending recovery decisions so reopening the panel or restarting the background worker can reconcile the current request. Accepted or uncertain submissions are never automatically repeated. Failed request snapshots retain their reason and enter recovery immediately.
- **Optional automatic recovery:** adds Safe, Strict, and Best-effort policies in Settings. Automatic recovery stays off by default. Retries are bounded and require evidence that Send was never activated; skipped contributions remain marked unavailable.
- **Answer language:** follows explicit language and translation requests, relevant conversation preferences, and the task language independently of the interface language. Quoted material and earlier AI answers remain source material.
- **Provider compatibility:** recognizes ChatGPT's unmarked ProseMirror composer within a scoped form, verifies Gemini's plain-text insertion before one Send activation, and reports Grok's visible registration gate as a sign-in requirement. Existing drafts and ambiguous submissions remain protected.
- **Panel usability:** keeps Send and Stop visible in short windows, preserves a scrollable workflow trace, and improves long role labels and keyboard behavior across all five interface languages.
- **Maintenance:** updates React and React DOM together to 19.3.1, Tailwind CSS to 4, TypeScript to 6, Webpack to 5.112.0, and PostCSS to 8.5.30. Required permissions and optional Meta AI access are unchanged from v0.3.0.

## Validation

- Node 22.18.0: 450 tests, TypeScript checks, production build, version consistency, and dependency audit passed with zero reported vulnerabilities.
- Chromium production bundle fixtures: 100 interface checks across five languages, 14 ChatGPT checks, 12 Gemini checks, and 5 Grok checks passed.
- An unpacked extension completed a real Gemini guest send and receive. A real Grok guest registration gate returned the expected sign-in error.

## Known limits

Authenticated five-provider workflows, Stop, and long responses have not been exercised end to end in this release. The real guest checks cover the provider content script rather than the complete background workflow. Meta AI remains experimental and off by default; authenticated Meta send and receive remains unverified. Provider page changes can still require compatibility updates.

## Installation

The GitHub Release includes `multi-ai-chat-store-v0.4.0.zip` and its `.sha256` checksum file. Verify and extract the ZIP, then load its directory from `chrome://extensions` with Developer mode enabled. The ZIP root contains `manifest.json`.

Chrome Web Store availability is separate from the GitHub Release and depends on the store submission and review. Existing store installations receive the update after it is approved and distributed.
