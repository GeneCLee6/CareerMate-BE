# CareerMate AI 後端工程規範（RULES）

核心精神為 **SOLID、DRY、KISS**。本文件說明「為什麼這樣拆」，`ARCHITECTURE.md` 說明「實際資料夾與資料流長什麼樣子」。

第 8～10 節的 **分支、PR、CI 規範與 `CareerMate-FE` 完全一致**，兩個 repo 請同步遵守。

## 1. SOLID 在本專案的具體落地

### 1.1 SRP（單一職責原則）

每一層只做一件事：

- **route**（`*.routes.js`）：只宣告路徑與中介層順序。不寫邏輯。
- **validation**（`*.validation.js`）：只驗證與正規化輸入。不碰資料庫。
- **controller**（`*.controller.js`）：只編排流程與權限檢查。不直接呼叫第三方 SDK。
- **service**（如 `chat/claude.service.js`）：只負責與外部服務往來，並把外部錯誤翻譯成本專案的 exception。
- **model**：只描述資料形狀與索引。

反例（禁止）：在 controller 裡直接 `new Anthropic()` 呼叫 API；在 validation 裡查資料庫看 email 是否重複。

### 1.2 OCP（開放封閉原則）

- **新增一種上傳類型**（例如作品集 zip）：在 `upload.validation.js` 的 `ALLOWED_TYPES` / `MAX_FILE_SIZE` 增加一筆，不修改 `getPresignedUploadUrl` 的流程。
- **更換 AI 供應商**：只替換 `chat/claude.service.js` 的內部實作，對外仍維持 `createReply({ user, resumes, history })` 與 `isConfigured()`。`chat.controller.js` 不需改動。

### 1.3 LSP（里氏替換原則）

所有 `exceptions/` 下的子類都繼承 `AppException`，且都必須帶 `status` 與可讀的 `message`。`error.middleware` 只依賴這兩個欄位，不對特定子類做特例判斷。

### 1.4 ISP（介面隔離原則）

中介層各自獨立、可單獨套用：`authGuard`（身分）、`roleGuard`（權限）、`validateBody`（輸入）、`rateLimiter`（流量）。不做一個「萬用 middleware」讓不需要權限檢查的路由被迫載入它。

### 1.5 DIP（依賴反轉原則）

- controller 依賴 `claude.service` 匯出的函式，不依賴 `@anthropic-ai/sdk` 的型別或錯誤類別；SDK 只在 service 內部被 import。
- 好處已被驗證：`claude.service.test.js` 只需 mock `@anthropic-ai/sdk` 就能完整測試錯誤對應，不需要金鑰也不會花錢。

## 2. DRY

| 容易重複的邏輯 | 集中管理位置 |
|---|---|
| 環境變數讀取與必填檢查 | `utils/config.js`，禁止各檔各自讀 `process.env` |
| 密碼規則（8 字元、含字母與數字） | `auth/auth.validation.js` 的 `passwordSchema`，`users/user.validation.js` 直接 import 復用 |
| 上傳的型別與大小限制 | `upload/upload.validation.js` 的 `ALLOWED_TYPES` / `MAX_FILE_SIZE`，resume 模組 import 使用 |
| S3 操作 | `utils/s3.js` |
| 錯誤輸出格式 | `middleware/error.middleware.js`，controller 只負責 `throw`，不自己 `res.status(...).json(...)` 錯誤 |
| 擁有權檢查 | 各模組內的 `findOwnXxx(id, userId)` 輔助函式（如 `findOwnResume`、`findOwnConversation`） |

## 3. KISS

這是一個**課程／作品集專案**，明確不做：

- 不做微服務，單一 Express 應用即可。
- 不引入 DI 容器；直接 require 就是最簡單的依賴注入。
- 不做 Repository Pattern 包一層 Mongoose；Mongoose 本身已是資料存取層。
- 不提前做對話摘要壓縮；先用「取最近 40 則」這個夠用的做法。
- 不追求 100% 覆蓋率（見 §6）。

## 4. 命名慣例

- 檔案：`<模組>.<職責>.js`，如 `auth.controller.js`、`chat.validation.js`、`claude.service.js`。
- 中介層：`<名稱>.middleware.js`。
- 例外類別：`<名稱>.exception.js`，類別名為 `XxxException`。
- 常數：全大寫加底線（`MAX_FILE_SIZE`、`HISTORY_LIMIT`）。
- 擁有權檢查函式：`findOwnXxx`。

## 5. 安全紅線

以下為**不可妥協**事項：

1. 任何金鑰只存在 `.env`，`.env` 必須在 `.gitignore` 中。新增設定時同步更新 `.env.example`（**只放欄位名稱，不放值**）。
2. 存取他人可能擁有的資源前，一定要比對 `resource.user.toString() === req.user.id`。
3. 5xx 不得把 `err.message` 回傳給客戶端。
4. 密碼一律 bcrypt，禁止自行實作雜湊或加鹽。
5. 回應中不得出現 password、passwordHistory、resetCode、resetToken。

## 6. 測試哲學

- **一定要測試**：純邏輯與安全相關項目——zod schema、密碼雜湊、JWT 簽發與驗證（含偽造／竄改／過期）、`claude.service` 的錯誤對應與拒答分支、`error.middleware` 的 4xx/5xx 分流。
- **建議測試**：controller 的失敗路徑（例如回覆失敗時是否回滾使用者訊息）。
- **不強制測試**：Mongoose model 的欄位定義本身。
- **外部服務一律 mock**：測試不得真的呼叫 Anthropic、AWS 或連線正式資料庫。`claude.service.test.js` 是範本。
- 測試檔與被測檔**放在一起**（`claude.service.js` 旁邊就是 `claude.service.test.js`），不另開 `tests/` 目錄。

> 已知陷阱：`utils/config.js` 在載入時凍結 `process.env`。要在測試中改變設定必須 `jest.mock("../utils/config")`；在 `beforeEach` 改 `process.env` 不會生效。若同一檔案內需要「有設定」與「無設定」兩種情境，拆成兩個測試檔（見 `claude.service.unconfigured.test.js`）。

## 7. Commit 訊息

採簡化版 Conventional Commits：`<type>: <說明>`。

**CareerMate 專案的 commit 與 PR 一律使用英文**（與 WearCast 等其他專案使用中文不同），因為本專案是對外作品集，且協作紀錄會被他人閱讀。

```
feat: add the AI chat API
fix: stop 500s leaking internal error messages
refactor: extract shared landing styles
docs: add PRD and RULES
test: cover the refusal path in claude.service
chore: bump user-event to v14
```

常用 type：`feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`perf`。

標題說明「做了什麼」而非「改了哪個檔案」。內文（可選）說明**為什麼**，以及任何非顯而易見的取捨。

## 8. 分支命名規範

格式：`<type>/<kebab-case-簡述>`

| 前綴 | 用途 | 範例 |
|---|---|---|
| `feat/` | 新功能 | `feat/ai-chat`、`feat/email-verification` |
| `fix/` | 修 bug | `fix/rate-limiter-and-error-leak` |
| `refactor/` | 不改行為的重構 | `refactor/landing-shared-styles` |
| `docs/` | 只動文件 | `docs/project-docs-and-ci` |
| `test/` | 只補測試 | `test/auth-routes` |
| `chore/` | 相依套件、設定 | `chore/bump-mongoose` |

規則：

- 一律從**最新的 `main`** 開分支（先 `git pull --ff-only`）。
- 分支名用英文小寫加連字號，不用底線、不用中文。
- **一個分支一件事**。修 bug 時順手做的重構，若與該 bug 無關就另開分支。
- 分支合併後即刪除，不長期保留。
- 禁止直接 push `main`。

## 9. PR 規範

**標題**：與 commit 同格式，`<type>: <說明>`，英文。

**內文必須包含**：

1. **為什麼**——解決什麼問題，或為什麼現在做。
2. **改了什麼**——重點條列，不是 diff 的翻譯。
3. **怎麼驗證的**——實際跑過的指令與結果（`npm test` 幾個通過、手動測了哪些情境）。
4. **已知缺口**——這個 PR 沒做但相關的事，誠實寫出來。

其他規則：

- 有 bug 修復時，**附上修復前的實際錯誤輸出**（狀態碼、錯誤訊息），證明問題存在而非推測。
- PR 應小而完整。超過約 400 行 diff 就考慮拆分。
- 跨 repo 的相依關係要寫明（例如前端 PR 需等後端 PR 先合併）。
- 合併前 CI 必須綠燈（見 §10）。

## 10. CI 規範

CI 設定於 `.github/workflows/ci.yml`，在 push 到 `main` 與所有針對 `main` 的 PR 上執行。

檢查項目：

| 檢查 | 指令 | 失敗代表 |
|---|---|---|
| 測試 | `npm test` | 邏輯壞了 |
| 啟動檢查 | 載入 `src/app.js` | 有語法錯誤或 require 路徑錯誤 |

規則：

- **CI 紅燈不得合併。**
- CI 不得需要任何真實金鑰。測試一律 mock 外部服務；工作流程只提供假的 `JWT_SECRET` 等必填設定。
- 新增測試指令時同步更新 workflow。
