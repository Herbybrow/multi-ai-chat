# Webchat 相容性與 PR 檢查

檢查日期：2026-10-19。優先處理 ChatGPT issue #76；draft PR #71 有可重現的側欄退步，暫不適合合併。四個 Dependabot PR 的組合候選通過測試。實際 webchat 收發中，Gemini 訪客模式通過，其他供應商的登入或驗證限制仍未排除。

## GitHub 項目與處理建議

| 項目 | 檢查結果 | 建議 |
| --- | --- | --- |
| [Issue 76](https://github.com/TED-H-com/multi-ai-chat/issues/76) | 唯一 open issue；回報 ChatGPT 空白 ProseMirror composer 無法連線。依回報建立的無標記 form fixture 在 master 無法 Ready | 優先修正 composer 辨識，保留排除訊息編輯框的限制 |
| [PR 71](https://github.com/TED-H-com/multi-ai-chat/pull/71) | Draft，60 個檔案、13 個 commits；GitHub 沒有回傳 checks。本機 444 項測試通過，但 Chromium UI 檢查失敗 | 修正下述側欄退步與 Gemini fixture 時序，再補登入後整合驗證；目前不合併 |
| [PR 72](https://github.com/TED-H-com/multi-ai-chat/pull/72) | `@types/chrome` 0.3.0 → 0.3.5 | 可列入下一批依賴合併 |
| [PR 73](https://github.com/TED-H-com/multi-ai-chat/pull/73) | PostCSS 8.5.28 → 8.5.29，含 nanoid 與 bundled WASM lockfile 更新 | 可列入下一批依賴合併 |
| [PR 74](https://github.com/TED-H-com/multi-ai-chat/pull/74) | `actions/setup-node` 7.0.0 → 7.1.0，維持 SHA pin | 可列入下一批依賴合併 |
| [PR 75](https://github.com/TED-H-com/multi-ai-chat/pull/75) | `actions/upload-artifact` 7.0.1 → 7.0.2，維持 SHA pin | 可列入下一批依賴合併 |

PR 72–75 的 GitHub Verify 均為 SUCCESS，CodeQL 為 NEUTRAL。四個 PR 在隔離 worktree 可無衝突整合；本機組合驗證通過，`dist/` 與 master 逐檔 SHA-256 相同。這是合併建議，本輪沒有合併遠端 PR、關閉 issue、留言或發布版本。

## 已重現的問題

### PR 71 的 Send 按鈕被裁出短視窗

在 `3b110903da18cb48f92c102a6ae4340a6f69e145` 的 production dist，使用 PR 自帶的 `scripts/check-readiness-ui.cjs`：選 Free、開啟未就緒 providers、模擬 Claude 開啟失敗、輸入十行草稿，將 viewport 設為 320×600。Send 的 `y=630.5`、高度 32，整個按鈕落在視窗下方。相同瀏覽器下 master 的五語 85 組檢查全部通過。

這是可觀察的版面退步，不是單元測試失敗。修正時需維持輸入區 Send／Stop 可見，同時保留 PR 對 trace 可捲動性的改善。證據：[截圖](../.claude-memory/qa/maintenance-2026-10-19/pr71-ui/en-draft-error-320.png)、[檢查結果](../.claude-memory/qa/maintenance-2026-10-19/pr71-ui/RESULTS.json)。

### ChatGPT 無標記表單仍需處理

在真實 Chromium DOM 中分別載入 master 與 PR 71 的 adapter 與 production bundle，測試空白 `.ProseMirror[contenteditable="true"]`，外層為普通 `form`，沒有舊 composer marker 或 Send／Stop 按鈕。即使加入 account profile button，master 仍無法 Ready，PR 71 也維持 unknown。

PR 71 已新增 `form[data-chatgpt-composer]`，帶有該屬性的對照 fixture 能 Ready。但 issue 76 未提供該新屬性的檢查結果，不能僅憑這個 PR 宣告 issue 已解決。需確認回報者實際表單，再決定是否補上範圍受限的 fallback；直接接受所有 form 內的 ProseMirror 會讓既有訊息編輯框測試失去保護。

舊 `#prompt-textarea` 對照在兩個候選均 Ready；inline message editor 均未被接受。證據：[source 與 built 結果](../.claude-memory/qa/maintenance-2026-10-19/chatgpt-fixtures.json)。

### PR 71 的 Gemini 瀏覽器腳本有過時的時序假設

`scripts/check-gemini-input.cjs` 在 `late editor rollback` 情境失敗，預期 `error.existing_draft`，實際收到成功的模擬回覆。單獨重現時，native edit 約在 58.6 ms、Send click 在 71.8 ms、rollback 才在 149.8 ms；送出的文字與目標 prompt 完全相同。

這份證據支持「fixture 將送出後回滾誤當成送出前阻擋」的判讀，不能據此宣稱錯誤草稿已被送出。應調整時序與斷言後再重跑完整腳本。重要空白差異的草稿保護另測通過，沒有 click 或 edit；被原腳本中止而未跑到的 disabled send、composer remount、只清空草稿、取消 reconciliation 四種情境也補跑通過。

證據：[完整腳本失敗](../.claude-memory/qa/maintenance-2026-10-19/pr71-gemini.log)、[回滾時間線](../.claude-memory/qa/maintenance-2026-10-19/pr71-gemini-rollback-repro.log)、[剩餘情境](../.claude-memory/qa/maintenance-2026-10-19/pr71-gemini-remaining.json)。

### Grok 訪客登入阻擋被回報成輸入框消失

實際 extension 在 grok.com 訪客頁送出測試字串後，頁面顯示使用者訊息與「Continue your conversation／Sign up for free」，沒有 assistant 回覆。Content script 最後回報 `error.send_failed`，detail 為 `input disappeared`。應改善登入阻擋的分類與提示；此結果不代表已登入 Grok 帳號也不能收發。

證據：[實機截圖](../.claude-memory/qa/maintenance-2026-10-19/live-grok.png)、[收發紀錄](../.claude-memory/qa/maintenance-2026-10-19/live-smoke.json)。

## 自動測試與 build

環境為 Node 24.21.0、npm 11.19.0、Chromium 153.0.8010.12、Playwright 1.64.1。本機 Node 與 CI 固定的 22.18.0 不同；CI 結果與本機結果分別列示。

| 候選 | 完整 verify | 瀏覽器檢查 | npm audit |
| --- | --- | --- | --- |
| Master `de72462`，runtime 同 `c8205af` | 241 項測試、typecheck、build、版號一致性通過 | 五語 85 組 UI 檢查通過；unpacked extension worker 與 panel 文件載入成功，無 page error | 0 vulnerabilities |
| PR 72–75 組合，以 `c8205af` 為基底 | 241 項測試、typecheck、build、版號一致性通過；dist 與 master 相同 | 未另重跑相同 dist 的 UI suite | 0 vulnerabilities |
| PR 71 `3b11090` | 444 項測試、typecheck、build、版號一致性通過；重建 dist 無差異 | UI suite 在英文第八組失敗；Gemini 腳本另有上述時序失敗 | 0 vulnerabilities |

Build 只有既有的 webpack bundle size warnings。Panel 文件載入與 Chrome API double 的 UI suite，不等於完整原生 Side Panel 工作流驗收。

## 五家 webchat 的實際觀察

全部使用新的隔離 profile，沒有帳號登入資料。Gemini／Grok 收發測試使用正式 unpacked extension 的 content script，經 `chrome.tabs.sendMessage` 送入單一測試 prompt；沒有經過完整 Free／Debate／Consult orchestration，也沒有驗證 Stop 或長串流。

| Provider | 公開頁面與 selector | 收發結果 |
| --- | --- | --- |
| ChatGPT | HTTP 403，停在驗證頁；另以 issue DOM fixture 重現問題 | BLOCKED，未送 prompt |
| Claude | HTTP 403，停在驗證頁 | BLOCKED，未送 prompt |
| Gemini | HTTP 200，現行 Quill composer 可找到 | **訪客單次收發 PASS**：收到 `RESPONSE_CHUNK` 與 `RESPONSE_DONE`，回覆為 22 字元的 `MULTI_AI_CHAT_SMOKE_OK` |
| Grok | HTTP 200，現行 ProseMirror 與送出按鈕可找到 | 訊息進入頁面後出現註冊提示；沒有完成回覆，extension 回報輸入框消失 |
| Meta AI | 導覽回應 HTTP 403，但有 landing shell 與 `Ask Meta AI` input；當時沒有被 adapter 接受的 Send 控制項 | 未送 prompt，不能據 shell 判 Ready 就認定收發可用 |

證據：[公開頁面 metadata](../.claude-memory/qa/maintenance-2026-10-19/public-webchat.json)、[正式 content script 收發](../.claude-memory/qa/maintenance-2026-10-19/live-smoke.json)、[extension 載入](../.claude-memory/qa/maintenance-2026-10-19/extension-load.json)。驗證頁與登入提示均未繞過。

## 近期官方更新與相容性風險

| Provider | 已確認的近期更新 | 對 extension 的判讀 |
| --- | --- | --- |
| ChatGPT | 官方近期列出跨裝置 Work、Space、Plugin Extensions 等變更。[官方更新](https://learn.chatgpt.com/docs/whats-new) | 公告沒有提供 composer DOM 契約；目前最具體的相容性證據仍是 issue 76 |
| Claude | 9/16 起逐步把 Cowork 能力整合到各對話，9/28 推出 Sonnet 5.5，10/7 推出 Haiku 5.5。[官方 release notes](https://support.claude.com/en/articles/12138966-release-notes) | 對話介面整合值得驗證輸入框、response 容器與 Stop；本機受驗證頁阻擋 |
| Gemini | 10/13 Gemini 4 Argon 進入 app，主聊天窗加入 chat／tasks 切換。[官方公告](https://blog.google/innovation-and-ai/products/gemini-app/gemini-4-argon-availability/) | 普通訪客 chat 本次成功；登入後 tasks 模式不能視為已相容 |
| Grok | 9/21 推出 Grok 4.7；官方更新列表亦列出 10/14 Voice 3.0。[模型公告](https://x.ai/news/grok-4-7)、[官方更新](https://x.ai/news) | 模型／語音更新不等於 DOM 改版證據；本次確認訪客頁仍有登入限制 |
| Meta | 10/12 發布 Muse Wonder／Wonder Full，公告先供 API／Muse Code，Muse 體驗後續推出。[官方公告](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/) | 不能據此推定 meta.ai 已切換模型或可沿用相同 selector；登入後 DOM 仍需另驗 |

## 證據與接手

本機證據根目錄為 `.claude-memory/qa/maintenance-2026-10-19/`，受 Git ignore 保護，不隨 clone 傳遞。`review-manifest.json` 記錄所有已測 PR 的完整 SHA、工具版本與 dist hashes；`issues.json`、`prs.json` 保存盤點快照。`browser-audit.cjs` 與 `live-smoke.cjs` 保留這次本機探測流程，後者會向訪客頁送出固定測試 prompt。

測試用 worktree 已清理，diff 與結果仍保留。要重跑 PR 71 的檢查，先以 `git worktree add --detach .claude-memory/qa/maintenance-2026-10-19/pr71 3b110903da18cb48f92c102a6ae4340a6f69e145` 恢復該候選並在其中執行 `npm ci`；瀏覽器腳本的 `PLAYWRIGHT_MODULE` 指向證據目錄下 `browser-tools/node_modules/playwright`，`READINESS_BROWSER` 或 `GEMINI_BROWSER` 指向此機 Chromium executable。

處理順序：先修 ChatGPT Ready 問題與 PR 71 的 Send 可見性，再校正 Gemini fixture，最後用已登入 Chrome 補齊五家收發、Stop、長回覆與跨 provider 工作流。四個依賴 PR 可以獨立處理，不必等待整個 draft PR 71 收斂。
