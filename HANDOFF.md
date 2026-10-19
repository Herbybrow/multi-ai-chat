# Multi AI Chat 遷移與接手索引

更新日期：2026-10-19。本 workspace 是 Chrome Side Panel extension，程式版本為 **0.4.0**。本次已同步 master、核對交接資料與封存改動；現有備份沒有需要直接套回這個 repo 的 patch。

後續已完成 [2026-10-19 issues、PR 與 webchat 測試](store/WEBCHAT-QC-2026-10-19.zh-TW.md)：ChatGPT 修正由 PR 77 提供；PR 71 已完成短視窗、復原與 Grok 登入阻擋修正，並整合 React／React DOM、Webpack、PostCSS 更新。Node 22 的 450 項測試與五語 100 組 UI 檢查通過，新版 Gemini 訪客收發也通過。先前排隊的 GitHub CI／CodeQL 已全部通過；其他 provider 的限制與實測範圍見報告。

[v0.4.0 已在 GitHub 發布](https://github.com/TED-H-com/multi-ai-chat/releases/tag/v0.4.0)，發布 commit 為 `2dc49c31009f5f5db22505a24880560de4196215`，升版 PR 82 的 CI／CodeQL 通過。ZIP 與 checksum 已下載回驗，runtime bundles 與已驗證候選相同。Chrome Web Store [自動送審流程](https://github.com/TED-H-com/multi-ai-chat/actions/runs/39303848603)已啟動，需經既有 environment 人工核准後才會上傳及送審；不能把 GitHub 發布當成商店已上架。詳見[發布說明](store/RELEASE-v0.4.0.md)。

## 目前程式基準

| 項目 | 整理結果 |
| --- | --- |
| Repository | `https://github.com/TED-H-com/multi-ai-chat.git` |
| 本機位置 | `/home/thuang/projects/multi-ai-chat` |
| 同步基準 | `c8205af2519ef9dfdfac565b7c8518efeef6a952`，2026-10-19 fetch 後的 `origin/master` |
| 本次同步 | 從 `92fdbdf` fast-forward 12 個 commits；包含網站圖解、文件、組織連結及 lockfile 更新 |
| Worktree 與 stash | 一個主 worktree，沒有本地 stash；同步前工作目錄乾淨 |
| 技術版本 | `package.json` 宣告 React 19、Tailwind CSS 4、TypeScript 6、Webpack 5，Node 要求 `>=22.18.0` |

上述 SHA 是同步程式碼的基準，本次交接文件由後續本機 docs commit 保存。再次接手時，先以 `git status --short --branch` 與 `git log -1` 確認當下狀態。

## 交接資料從哪裡讀

| 資料 | 用途與時效 |
| --- | --- |
| 本檔 | 遷移結果、patch 處理決定及後續接手入口 |
| [v0.3.0 發布交接](store/V0.3.0-HANDOFF.zh-TW.md) | 2026-09-24 的發布背景、Meta 刻意保留的行為及發布流程；其中依賴升級待辦已過時 |
| [PR 42 交接](store/PR42-HANDOFF.zh-TW.md) | 2026-09-20 的實作與測試證據；當時的 draft、0.2.3 與未合併狀態已被後續提交取代 |
| [目前本機 session 摘要](.claude-memory/session.md) | 此機的接手提示，受 Git ignore 保護 |
| [原始 session 筆記封存](.claude-memory/archive/session-2026-09-20.md) | 舊 `.claude-memory/session.md` 完整原文，逐位元組保存 |
| [舊 worktree 封存說明](.claude-memory/qa/grok-sweep/ARCHIVED.md) | 2026-09-30 的六組 worktree 處理決定 |
| [本機備份清單](.claude-memory/migration-2026-10-19.json) | session 與封存檔案的位置、大小、SHA-256、可讀性及缺少的 rollout |

`.claude-memory/` 與 `~/migrate-castle1/` 是本機資料，不會隨 clone 帶到另一台機器。舊筆記中的 `/home/ted-h/` 是原機路徑；歷史 `/tmp/` 證據路徑不代表此機已有對應檔案。

## Patch 與 worktree 的處理結果

`~/migrate-castle1/multi-ai-chat/` 在本次盤點時不存在。這個 repo 的舊改動實際保存在 `.claude-memory/qa/grok-sweep/`，每組都有 `worktree-final.patch`；部分另有 `worktree-untracked.tgz`。

| 封存目錄 | Patch | 未追蹤檔封存 | 處理決定 |
| --- | --- | --- | --- |
| `meta/` | 15,295 bytes | 無 | 保留；Meta 改動已有整合紀錄 |
| `persistence/` | 21,769 bytes | 有 | 保留；保存與 replay 修正已有整合紀錄，後續測試納入 PR 60 |
| `workflow/` | 41,935 bytes | 無 | 保留；workflow 修正已整合，run marker 與回歸測試由 PR 60 收尾 |
| `ui/` | 35,896 bytes | 有 | 保留；UI 修正已整合，執行中角色按鈕與長標籤由 PR 61 收尾 |
| `release_audit/` | 空檔 | 有 | 保留；封存的是 release review 文件，不是待套的程式修改 |
| `extension_qc/` | 空檔 | 有 | 保留；封存說明將舊測試 harness 與 fixture 文件列為已淘汰項目 |

封存說明記載主要修正整合於 `d2f776b`；PR 60 合併點 `fd7e4fe`、PR 61 合併點 `dfdbcfd` 也都已是目前 master 的祖先。這些 patch 用於追查歷史，不整包重套。若日後發現仍有缺漏，針對具體行為與現行程式逐項比對。

`~/migrate-castle1/multi-ai-chat-app/` 是另一個 **AI Sister 網頁專案**。其中 `wip-tracked.patch`、`castle1-stash0.patch`、`wip-untracked.tgz`、`untracked-web-dist-prev-NOT-APPLIED.tgz` 留給該 workspace 的 session 判斷；其 `server/`、`web/` 改動不適用於本 extension。`multi-ai-chat-desktop` 則是獨立的 Tauri 專案。

## Session 備份完整度

備份位置為 `~/migrate-castle1/codex-sessions/multi-ai-chat/`。`threads.tsv` 有四筆索引，實際找到兩份 JSONL 對話檔，兩份皆可完整解析。

| Thread ID | 備份狀態 |
| --- | --- |
| `01a0bdbe-f6bc-7600-8deb-957d08483bfc` | 有，位於 `sessions/2026/09/20/` |
| `01a0c441-1345-7960-a39d-375cf9e22d30` | 有，位於 `sessions/2026/09/21/` |
| `019f261b-aaa9-70b1-aacb-d6dbd3ae16d6` | 僅索引；備份與此機 `.codex/sessions`、`.codex/archived_sessions` 未找到對話檔 |
| `019f262b-3f6b-7143-9b1b-30e4346cb9d5` | 僅索引；原位置是 `.bat-worktrees/b5f13988`，相同範圍未找到對話檔 |

這個缺口不影響目前程式與 patch 的處理決定；若要還原完整早期對話，仍需從原機或其他備份找回這兩份 rollout。

## 舊待辦如何解讀

- **PR 42 已合併，source 已是 0.3.0。** 其發布背景見 v0.3.0 交接；舊 session 的 0.2.3、draft 與尚未發版敘述只適用於當時。
- **依賴升級與掃描收尾已有提交。** React 19、Tailwind 4 分別經 PR 59、PR 62 合併；PR 60、PR 61 已處理封存說明列出的程式與 UI 剩餘項目。
- **Meta 實機證據需依具體候選版判讀。** PR 42 交接曾引用 Conductor 對較早版本 Steps 2–3 的 PASS 回報；v0.3.0 交接則記載未完成登入後實機驗證。這些歷史敘述不能合併成目前版本的完整 VM PASS。後續需要實測時，使用 [Meta smoke 清單](store/META-AI-SMOKE.md)、[Step3](store/META-AI-STEP3.md) 與 [UX QC](store/META-AI-UX-QC.md)，留下實際 SHA 與觀察結果。

## 驗證與後續工作

本次檢查了同步前後 Git 狀態、提交祖先關係、四份 tgz 的可讀性、兩份 session JSONL 的格式，以及 package／manifest 的 0.3.0 版號一致性。所有原始備份保留；沒有套用 patch 或重新啟動舊工作流。

遷移盤點本身未執行完整程式驗證。後續維護任務已安裝依賴並完成 master、PR 71 與依賴組合的 `npm run verify`，另做 Chromium 與公開頁面測試；完整結果與限制見上方測試報告。登入後 Meta 驗證仍待補齊。
