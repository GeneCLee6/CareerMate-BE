# CareerMate AI 後端產品需求文件（PRD）

## 1. 專案簡介與目標

**CareerMate AI** 是一個以 AI 為核心的求職準備平台，幫助學生與初階工程師處理三件事：**改履歷、練面試、規劃職涯**。

本文件描述的是 **CareerMate-BE**：提供 REST API 的 Node.js 服務，負責帳號、個人檔案、履歷檔案與 AI 對話。使用者實際看到的介面在另一個 repo（**CareerMate-FE**），兩者透過 `/v1` 開頭的 HTTP API 溝通。

後端的目標不是「把所有邏輯都做完」，而是**成為前端唯一可信任的資料來源與唯一持有機密的地方**。任何金鑰（資料庫、AWS、Anthropic）都只存在於後端，前端一律不得持有。

## 2. 目標使用者

- 求職中的學生／轉職者（JR Academy AI Engineering 課程情境）。
- 單一角色為主：一般使用者（`accountType: "user"`）。另有 `admin` 角色，目前僅用於刪除／還原帳號，無對應前端介面。
- 多使用者、需帳號隔離：每位使用者只能存取自己的履歷與對話，這是**硬性需求**而非之後再補。

## 3. 核心功能需求

### 3.1 帳號與驗證（`/v1/auth`）

| 端點 | 用途 | 備註 |
|---|---|---|
| `POST /auth/register` | 註冊並直接回傳 token | 回 201 |
| `POST /auth/login` | 登入 | 帳密錯誤回 401 |
| `POST /auth/forgot-password` | 產生 6 位數重設碼 | **信件尚未實際寄出**，見 §6 |
| `POST /auth/verify-code` | 驗證重設碼，換取 resetToken | 碼錯或過期回 401 |
| `POST /auth/reset-password` | 用 resetToken 設定新密碼 | 不可與歷史密碼重複 |

- 密碼規則：至少 8 字元，且同時包含英文字母與數字。此規則為**唯一事實來源**，前端只是鏡射它以提早回饋。
- 密碼以 bcrypt（12 rounds）雜湊，並保留最近數筆 `passwordHistory` 以阻擋重複使用。
- 認證採 JWT（`Authorization: Bearer <token>`），預設 7 天有效。

### 3.2 個人檔案（`/v1/users`）

| 端點 | 用途 |
|---|---|
| `GET /users/me` | 取得目前使用者 |
| `PUT /users/me` | 更新姓名、顯示名稱、role、field、goal |
| `PUT /users/me/password` | 已登入狀態下變更密碼（需提供現有密碼） |
| `POST /users/me/avatar` | 以 fileKey 設定頭像 |

- `role` 限 `Student` / `Other`；`field` 限 `FE` / `BE`；`goal` 為自由文字。
- 這三個欄位同時餵給 AI 對話的 system prompt（見 §3.4），因此**它們不只是個人資料，也是 AI 的輸入**。

### 3.3 檔案上傳與履歷（`/v1/upload`、`/v1/resumes`）

採兩段式上傳，避免檔案經過應用伺服器：

```
前端 ──① 要 presigned URL──► 後端 ──► S3 簽章
前端 ──② PUT 檔案直送────────────────► S3（tmp/ 前綴）
前端 ──③ 用 fileKey 建立資源──► 後端 ──► 驗證後搬到正式前綴
```

- 履歷限 PDF、10MB；頭像限 JPEG/PNG/WebP、5MB。限制在後端強制執行，前端鏡射。
- 上傳先落在 `tmp/{userId}/`，經 `validateS3File` 確認型別與大小後才複製到 `resume/{userId}/`，再刪除暫存檔。
- **已知限制**：S3 bucket 必須設定 CORS 允許前端網域 PUT，否則瀏覽器上傳會被擋（curl 不受影響）。

### 3.4 AI 對話（`/v1/chat`）

| 端點 | 用途 |
|---|---|
| `GET /chat/status` | 回報伺服器是否設定了 AI 金鑰 |
| `GET /chat/conversations` | 列出使用者的對話 |
| `GET /chat/conversations/:id/messages` | 讀取單一對話 |
| `POST /chat/messages` | 送出訊息（自動建立新對話） |
| `POST /chat/conversations/:id/messages` | 在既有對話中續談 |
| `DELETE /chat/conversations/:id` | 刪除對話與其訊息 |

行為需求：

- 對話與訊息**必須持久化**，重新整理不得遺失。
- System prompt 需帶入使用者的 `fullName`、`role`、`field`、`goal` 與履歷**檔名**，讓 AI 不必重問已知資訊。
- 目前**讀不到履歷內容**，system prompt 需明講此限制，要求 AI 請使用者貼上相關段落，而非假裝讀過。
- 未設定 `ANTHROPIC_API_KEY` 時：服務照常啟動、`/chat/status` 回報 `configured: false`、送訊息回 **503**。
- 送出失敗時必須**回滾使用者那則訊息**，不得在對話中留下沒有回覆的提問。

模型選擇與參數說明見 `ARCHITECTURE.md` §5。

## 4. 非功能需求

| 項目 | 需求 |
|---|---|
| 資料隔離 | 每個資源存取前都必須確認 `resource.user === req.user.id`，不可只靠「前端不會送別人的 id」 |
| 機密管理 | 所有金鑰只存在後端 `.env`，不得出現在程式碼、commit 或回應中 |
| 錯誤訊息 | 4xx 可回傳給使用者看；5xx 一律回通用訊息並記錄完整細節於 log |
| 速率限制 | 全域 100 次／15 分鐘，`dev`／`test` 環境跳過 |
| 可觀測性 | 5xx 必須留下 method、path、message、stack |

## 5. 明確不做的事（範圍外）

- 不做多租戶／組織帳號，`admin` 僅為最小管理能力。
- 不自建郵件伺服器，寄信一律走第三方服務（見 §6）。
- 不做即時串流回覆（SSE/WebSocket），目前為一次性請求回應。
- 不做付費訂閱、額度計費。
- 不追求 100% 測試覆蓋率，測試策略見 `RULES.md` §6。

## 6. 已知缺口（尚未完成）

依優先順序：

1. **寄信功能完全不存在**。`forgotPassword` 會產生並儲存 6 位數碼，但從未寄出（原始碼註解已載明）。這同時擋住「忘記密碼」與規劃中的「Email 驗證碼註冊」。
2. **Email 驗證碼註冊**尚未開始。需先完成第 1 項。
3. **履歷內容無法被 AI 讀取**，需加入 PDF 文字擷取。
4. `resetCode` 以明文儲存且以 `!==` 比對（非常數時間）。
5. `authGuard` 只驗證 token，不檢查帳號是否已被軟刪除，token 最長可再用 7 天。
6. `cors()` 未限制來源。
7. 缺少 route／整合測試（目前僅純邏輯單元測試）。

## 7. 完成定義（Definition of Done）

一項功能視為完成，需同時滿足：

- 端點有對應的 zod 驗證，且錯誤訊息對使用者可讀。
- 有權限檢查（若涉及使用者資料）。
- 失敗路徑有明確行為（回滾、狀態碼、訊息），不是「剛好不會壞」。
- 有測試覆蓋核心邏輯與失敗分支。
- `npm test` 全數通過。
