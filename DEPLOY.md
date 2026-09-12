# CareerMate AI 部署指南（DEPLOY）

本文件說明前後端各自該部署在哪、為什麼，以及各平台的優缺點。前端另有一份相同結論的 `DEPLOY.md`。

## 0. 先理解：為什麼 Elastic Beanstalk 會一直扣錢

EB 本身不收費，但它會替你開 **EC2 執行個體**（視設定可能還有 Load Balancer）。**EC2 是按開機時間計費，不是按請求數計費**——沒有人使用時一樣在計費。

這就是「忘記關幾天就被扣 3–4 澳幣」的原因：你付的是「開著」，不是「有人用」。一台 t3.micro 持續運行大約就是這個量級，Load Balancer 若有開則更貴（每月約 US$16 起）。

**結論**：對個人作品集專案，任何「按小時計費的常駐主機」都會慢慢流血。應改用有免費額度、閒置不計費的平台。

## 1. 推薦組合（目標：月費 0 元）

| 層 | 選擇 | 免費額度 |
|---|---|---|
| 前端（靜態） | **Cloudflare Pages** | 流量無上限，每月 500 次建置 |
| 後端（API） | **Render** Free Web Service | 750 小時／月，閒置會休眠 |
| 資料庫 | **MongoDB Atlas M0** | 512MB，永久免費 |
| 檔案儲存 | **Cloudflare R2** | 10GB 儲存，**流量出口不計費** |
| 寄信 | **Brevo** | 300 封／天 |

> 免費方案的條件常變動，實際部署前請以各平台官網當下的說明為準。

## 2. 前端部署平台比較

| 平台 | 優點 | 缺點 | 適合本專案？ |
|---|---|---|---|
| **Cloudflare Pages** | 流量不計費；全球 CDN；免費額度最寬鬆 | 建置次數有月限；生態系不如 Vercel 熱門 | ✅ **推薦** |
| **Vercel** | DX 最佳；預覽部署好用；React 支援最成熟 | 免費方案對商業用途有限制；流量超額要付費 | ✅ 可用 |
| **Netlify** | 表單、重導向等功能完整 | 免費頻寬 100GB／月，相對較緊 | 🟡 可用 |
| **GitHub Pages** | 完全免費、與 repo 同源 | 只支援靜態；SPA 路由需 hack；無環境變數機制 | ❌ 不建議 |

前端是 CRA 產生的靜態檔案，三者皆可。選 Cloudflare Pages 主要是流量不計費。

**SPA 路由注意**：`/login`、`/app` 等路徑需設定 fallback 到 `index.html`，否則直接輸入網址會 404。

## 3. 後端部署平台比較

後端的限制條件比前端嚴格得多：**呼叫 Claude 可能耗時 10–60 秒**，這直接排除了多數免費 serverless 方案。

| 平台 | 優點 | 缺點 | 適合本專案？ |
|---|---|---|---|
| **Render**（Free Web Service） | 真正免費；長駐容器**沒有單次請求時間上限**；支援 Node 原生 | **閒置 15 分鐘休眠，冷啟動約 50 秒**；免費方案不保證資源 | ✅ **推薦** |
| **Fly.io** | 效能好；可選機房靠近使用者 | 需綁信用卡；免費額度近年縮減 | 🟡 可用 |
| **Railway** | DX 佳、設定簡單 | **已非真正免費**，試用額度用完即需付費 | 🟡 看預算 |
| **Vercel Serverless Functions** | 與前端同平台，部署方便 | **有單次執行時間上限**（Hobby 方案較短），長時間的 AI 回覆會 timeout；且不適合常駐 Mongoose 連線 | ❌ **不建議** |
| **Cloudflare Workers** | 免費額度極寬鬆；啟動極快 | 非完整 Node 環境，**Mongoose 無法直接使用**，需大幅改寫 | ❌ 不建議 |
| **AWS Elastic Beanstalk** | 與現有 AWS 資源同生態 | **按小時計費，閒置照樣收錢**（見 §0） | ❌ 不建議續用 |

**取捨說明**：Render 的冷啟動（約 50 秒）確實惱人，但相較於「AI 回覆中途被 serverless 平台 timeout 掐斷」，前者只是等待、後者是功能直接不可用。對這個專案，**冷啟動是可接受的代價，執行時間上限不是**。

## 4. 檔案儲存：S3 → Cloudflare R2

R2 相容 S3 API，因此現有的 `@aws-sdk/client-s3` 與 `@aws-sdk/s3-request-presigner` 程式碼**幾乎不需修改**，只要：

1. 把 client 的 `endpoint` 指向 R2（`https://<account_id>.r2.cloudflarestorage.com`）。
2. `region` 設為 `auto`。
3. 換成 R2 的 access key。

最大的實際差異是 **R2 不收流量出口費用**，而 S3 會。對會下載履歷的應用，這個差別會隨使用量放大。

## 5. S3／R2 的 CORS 設定（必要）

瀏覽器直傳檔案會先發 preflight 請求。**bucket 未設定 CORS 時，上傳一定失敗**，而且用 curl 測試不會重現（curl 不執行 CORS）。

錯誤訊息長這樣：

```xml
<Error><Code>AccessForbidden</Code>
<Message>CORSResponse: CORS is not enabled for this bucket.</Message></Error>
```

設定內容：

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://<你的前端網域>"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

`AllowedOrigins` 必須列出**前端實際的網址**，本機開發與正式網域都要加。

## 6. 環境變數

部署時於平台的 Environment 設定頁填入，**不要** commit 進 repo。欄位清單見 `.env.example`。

| 變數 | 必填 | 說明 |
|---|---|---|
| `MONGODB_URI` | ✅ | Atlas 連線字串 |
| `JWT_SECRET` | ✅ | 隨機長字串 |
| `S3_BUCKET` | ✅ | bucket 名稱 |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅（用到上傳時） | R2 亦用同組欄位 |
| `ANTHROPIC_API_KEY` | ❌ | 未設定時 AI 對話回 503，服務仍可運行 |
| `NODE_ENV` | ❌ | 正式環境請設為 `production`，否則速率限制會被跳過 |

> **部署前務必把 `NODE_ENV` 設為 `production`**：`rateLimiter` 在 `dev`／`test` 會跳過限流。

## 7. 上線前檢查清單

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` 換成新的隨機值（不要沿用開發用的）
- [ ] `cors()` 限制來源為前端網域（目前程式碼尚未限制，見 `PRD.md` §6）
- [ ] S3／R2 的 CORS 已包含正式前端網域
- [ ] MongoDB Atlas 的 Network Access 已允許部署平台的 IP
- [ ] 前端的 `REACT_APP_API_BASE_URL` 指向正式後端網址（含 `/v1`）
