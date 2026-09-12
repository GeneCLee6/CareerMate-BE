# CLAUDE.md — CareerMate-BE

給 Claude Code 的專案指引。開始動工前請先讀 `RULES.md` 與 `ARCHITECTURE.md`。

## 這是什麼

CareerMate AI 的後端 REST API。Node.js + Express 5 + MongoDB，CommonJS，**沒有 TypeScript**。

前端是另一個 repo（`CareerMate-FE`），改動 API 形狀時要考慮對它的影響。

## 動工前必讀

| 情境 | 先讀 |
|---|---|
| 加功能 | `PRD.md` §3（現有端點）、`ARCHITECTURE.md` §2（分層） |
| 改 AI 對話 | `ARCHITECTURE.md` §5 |
| 寫測試 | `RULES.md` §6（含 config mock 的陷阱） |
| 開分支、開 PR | `RULES.md` §8–10 |
| 部署 | `DEPLOY.md` |

## 硬性規則

1. **不要把金鑰寫進程式碼、commit 或 `.env.example` 的值**。使用者的金鑰由使用者自己填進 `.env`，不要要求他們貼給你。
2. **不要直接 push `main`**，一律開分支走 PR。
3. **5xx 不得回傳 `err.message` 給客戶端**（`error.middleware.js` 已處理，不要繞過）。
4. **存取使用者資源前必須檢查擁有權**，參考各模組的 `findOwnXxx`。
5. **外部服務在測試中一律 mock**，測試不得花錢或連線正式資料庫。

## 常見陷阱

- **`utils/config.js` 在載入時凍結 `process.env`**。測試要改設定必須 `jest.mock("../utils/config")`；在 `beforeEach` 設 `process.env` 無效。同檔案要測「有設定」與「無設定」兩種情境時，拆成兩個測試檔。
- **新增 Mongoose model 一定要設 `toJSON: { virtuals: true }`**。`Resume` 沒設，導致前端只拿到 `_id` 沒有 `id`，刪除功能曾因此送出 `/resumes/undefined` 並收到 500。
- **Claude 拒答是 HTTP 200**（`stop_reason === "refusal"`），不是錯誤。不先檢查就讀 `content` 會拿到空字串。
- **`DELETE` 回 204 無 body**，HTTP client 要能處理空回應。
- **Express 5 原生支援 async handler 拋錯**，不需要 try/catch 包起來再 `next(err)`。

## 開發指令

```bash
npm run dev     # nodemon，預設 :3000
npm test        # Jest，不需金鑰
```

手動驗證 API 時，用 `curl` 打真實端點比寫一次性腳本可靠。注意 **curl 不執行 CORS**，所以瀏覽器端的上傳問題用 curl 重現不出來。

## 目前的已知缺口

見 `PRD.md` §6。最擋路的是**寄信功能完全不存在**——忘記密碼會產生驗證碼但從未寄出，而規劃中的 Email 驗證碼註冊也依賴它。
