# CareerMate-BE

CareerMate AI 的後端 API：帳號、個人檔案、履歷檔案與 AI 對話。

前端在 [CareerMate-FE](https://github.com/GeneCLee6/CareerMate-FE)。

## 文件

| 文件 | 內容 |
|---|---|
| [`PRD.md`](./PRD.md) | 產品需求、API 清單、已知缺口 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 分層、資料模型、AI 設計、錯誤契約 |
| [`RULES.md`](./RULES.md) | 工程規範、命名、測試、分支／PR／CI 規範 |
| [`DEPLOY.md`](./DEPLOY.md) | 部署平台比較與設定 |

## 技術

Node.js · Express 5 · MongoDB (Mongoose) · zod · JWT · AWS S3 · Claude (`@anthropic-ai/sdk`) · Jest

## 開始開發

```bash
npm install
cp .env.example .env   # 填入 MONGODB_URI、JWT_SECRET、S3_BUCKET
npm run dev            # http://localhost:3000
```

需要本機 MongoDB（或 Atlas 連線字串）。`ANTHROPIC_API_KEY` 為選填——沒有它服務照常啟動，只是 AI 對話會回 503。

## 指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發模式（nodemon 熱重載） |
| `npm start` | 正式啟動 |
| `npm test` | 執行測試 |
| `npm run test:watch` | 監看模式 |

## API 一覽

基礎路徑 `/v1`，除 `/auth/*` 外皆需 `Authorization: Bearer <token>`。

| 群組 | 端點 |
|---|---|
| `auth` | register、login、forgot-password、verify-code、reset-password |
| `users` | me（GET/PUT）、me/password、me/avatar |
| `upload` | presigned-url |
| `resumes` | 建立、列表、下載、刪除 |
| `chat` | status、conversations、messages |

詳細說明見 [`PRD.md`](./PRD.md) §3。

## 測試

```bash
npm test
```

測試不需要金鑰，也不會連線真實資料庫或呼叫 Anthropic——所有外部服務皆為 mock。
