# CareerMate AI 後端架構（ARCHITECTURE）

`PRD.md` 說明「要做什麼」，本文件說明「實際長什麼樣子、資料怎麼流」。`RULES.md` 說明「為什麼這樣拆」。

## 1. 技術選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| 執行環境 | Node.js + Express 5 | Express 5 原生支援 async handler 拋錯，不需 `express-async-errors` |
| 語言 | JavaScript（CommonJS） | 沿用既有程式碼，未導入 TypeScript |
| 資料庫 | MongoDB + Mongoose 9 | 文件型結構適合對話與彈性的個人檔案欄位 |
| 驗證 | zod 4 | 與前端共用同一套規則概念，錯誤訊息可直接給使用者 |
| 認證 | jsonwebtoken + bcryptjs | 無狀態 token，水平擴充不需共享 session |
| 檔案儲存 | AWS S3（presigned URL） | 檔案不經過應用伺服器，省頻寬與記憶體 |
| AI | `@anthropic-ai/sdk`（Claude） | 見 §5 |
| 測試 | Jest | 見 `RULES.md` §6 |

## 2. 分層與資料流

本專案採**依功能分模組**（feature folder），每個模組內部再依職責分檔：

```
route  ──►  validation（zod）  ──►  controller  ──►  model / service
  │              │                      │                │
  │              │                      │                └─ 只碰資料與外部服務
  │              │                      └─ 只編排流程與權限，不寫商業規則細節
  │              └─ 只驗證與正規化輸入，不碰資料庫
  └─ 只宣告路徑與中介層順序
```

一次請求的完整路徑：

```
Request
  └─ helmet → morgan → rateLimiter → express.json → cors
       └─ /v1 router
            └─ authGuard（受保護路由）
                 └─ validateBody(schema)
                      └─ controller
                           ├─ Mongoose model（MongoDB）
                           ├─ s3 utils（AWS）
                           └─ claude.service（Anthropic）
  └─ errorHandler（最後，統一輸出）
```

## 3. 目錄結構

```
src/
├── app.js                  Express 應用組裝（中介層順序在此）
├── index.js                啟動點：連線資料庫後才 listen
├── routes.js               /v1 路由表，authGuard 掛載位置
│
├── auth/                   註冊、登入、忘記密碼
├── users/                  個人檔案、密碼變更、頭像、管理操作
├── upload/                 presigned URL 發放
├── resumes/                履歷建立、列表、下載、刪除
├── chat/                   AI 對話（見 §5）
│
├── middleware/
│   ├── authGuard           驗證 JWT，注入 req.user
│   ├── roleGuard           檢查 accountType
│   ├── validation          validateBody(zodSchema)
│   ├── rateLimit           全域限流
│   ├── morgan              請求日誌
│   └── error               統一錯誤輸出（見 §6）
│
├── exceptions/             AppException 與各狀態碼子類
└── utils/                  config、db、jwt、password、s3、logger
```

**新增檔案時先問**：這屬於「路徑宣告、輸入驗證、流程編排、資料存取」哪一層？放錯層會讓權限檢查散落各處。

## 4. 資料模型

| Model | 關鍵欄位 | 備註 |
|---|---|---|
| `User` | email（唯一）、password、fullName、displayName、role、field、goal、avatar、accountType、passwordHistory、resetCode/resetToken、deletedAt | `toJSON` 移除 password、`__v`、accountType、passwordHistory |
| `Resume` | user、fileKey、fileName、fileSize | **目前未設 `toJSON: { virtuals: true }`**，因此只有 `_id` 沒有 `id`，前端需自行正規化 |
| `Conversation` | user、title、lastMessageAt | 有設 virtuals |
| `Message` | conversation、user、role、content、usage | 有設 virtuals；`conversation + createdAt` 複合索引 |

> `Resume` 缺少 virtuals 曾導致前端刪除功能送出 `/resumes/undefined` 並收到 500。新增 model 時請一律設定 `toJSON: { virtuals: true }`。

## 5. AI 對話設計

**模型**：`claude-opus-5`，`thinking: { type: "adaptive" }`。

| 參數 | 值 | 理由 |
|---|---|---|
| `effort` | `medium` | 職涯對話偏「對話」而非「硬推理」，medium 兼顧速度與成本；回答變淺時再調高 |
| `max_tokens` | 16000 | 這是**上限不是目標**，未用到的 output token 不計費，只是避免長答案被截斷 |
| `fallbacks` | `"default"` | 模型拒答時在同一次呼叫改由備援模型接手 |

**必須注意的兩件事**：

1. **拒答是 HTTP 200**，`stop_reason === "refusal"`。不先檢查就讀 `content` 會得到空回覆，因此 `claude.service` 明確處理此分支。
2. **錯誤要用 SDK 的型別類別判斷**，不可比對錯誤字串。對應關係：`AuthenticationError` → 503、`RateLimitError` → 429、`BadRequestError` → 400、其餘 `APIError` → 502。

**降級行為**：`ANTHROPIC_API_KEY` 為選填。未設定時 `getClient()` 拋 503，服務本身照常啟動，`/chat/status` 回報 `configured: false`。

**歷史長度**：每次送出最近 40 則訊息（`HISTORY_LIMIT`），更舊的直接捨棄，目前不做摘要壓縮。

## 6. 錯誤處理契約

所有錯誤最終都經過 `middleware/error.middleware.js`：

| 狀態碼 | 回傳給客戶端 | 是否記錄 |
|---|---|---|
| 4xx | `err.message` 原文 | 否 |
| 5xx | 固定字串 `Something unexpected happened` | 是（method、path、message、stack） |

理由：4xx 訊息是寫給使用者看的（`Email already exists!`）；5xx 訊息是內部細節（Mongoose 的 cast error 會洩漏 model 與欄位名稱）。

統一回應格式：

```json
成功：{ "success": true, "data": ... }        或 { "success": true, "message": "..." }
失敗：{ "success": false, "error": { "message": "..." } }
```

`DELETE` 成功回 **204 無內容**——前端的 HTTP client 必須能處理空 body。

## 7. 設定與機密

`utils/config.js` 在載入時一次讀取 `process.env` 並驗證必填項，缺少即拋錯終止啟動。

| 分類 | 變數 |
|---|---|
| 必填 | `MONGODB_URI`、`JWT_SECRET`、`S3_BUCKET` |
| 選填 | `PORT`、`NODE_ENV`、`LOG_LEVEL`、`JWT_EXPIRES_IN`、`AWS_REGION`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`CLOUDFRONT_DOMAIN`、`ANTHROPIC_API_KEY` |

**注意**：因為 config 在模組載入時就凍結了值，測試若要改變設定，必須 `jest.mock("../utils/config")`，在 `beforeEach` 改 `process.env` 是無效的。
