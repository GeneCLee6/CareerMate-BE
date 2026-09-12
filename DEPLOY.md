# CareerMate AI — Deployment Guide

Where each half of the product should be hosted, and why. The frontend
repository carries a matching `DEPLOY.md` that reaches the same conclusions.

## 0. Why Elastic Beanstalk keeps charging

Elastic Beanstalk itself is free, but it provisions **EC2 instances** for you
— and, depending on configuration, a load balancer. **EC2 bills for uptime,
not for requests.** It charges while nobody is using it.

That is the whole explanation for "I forgot to shut it down for a few days and
it cost a few dollars": you are paying for *running*, not for *being used*. A
t3.micro left on costs roughly that; a load balancer costs considerably more
again.

**Conclusion**: for a portfolio project, any per-hour always-on host bleeds
money slowly. Use a platform with a free tier that does not bill while idle.

## 1. Recommended setup (target: $0/month)

| Layer | Choice | Free allowance |
| --- | --- | --- |
| Frontend (static) | **Cloudflare Pages** | Unmetered bandwidth, 500 builds/month |
| Backend (API) | **Render** free web service | 750 hours/month, sleeps when idle |
| Database | **MongoDB Atlas M0** | 512 MB, free indefinitely |
| File storage | **Cloudflare R2** | 10 GB stored, **no egress charges** |
| Email | **Brevo** | 300 emails/day |

> Free-tier terms change often. Check each provider's current terms before
> committing.

## 2. Frontend hosting compared

| Platform | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| **Cloudflare Pages** | Unmetered bandwidth; global CDN; most generous free tier | Monthly build cap; smaller ecosystem than Vercel | ✅ **Recommended** |
| **Vercel** | Best developer experience; preview deployments; most mature React support | Free tier restricts commercial use; bandwidth overage is billed | ✅ Workable |
| **Netlify** | Forms, redirects and similar built in | 100 GB/month bandwidth is comparatively tight | 🟡 Workable |
| **GitHub Pages** | Free, lives with the repo | Static only; SPA routing needs a hack; no environment variables | ❌ Not advised |

The frontend is a static CRA build, so any of these can serve it. Cloudflare
Pages wins mainly on bandwidth not being metered.

**SPA routing**: paths such as `/login` and `/app` must fall back to
`index.html`, or entering a URL directly returns 404.

## 3. Backend hosting compared

The backend has a much harder constraint than the frontend: **a call to
Claude can take tens of seconds**, which rules out most free serverless tiers.

| Platform | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| **Render** (free web service) | Genuinely free; a long-lived container with **no per-request time limit**; native Node | **Sleeps after 15 idle minutes, ~50s cold start**; no resource guarantees on free | ✅ **Recommended** |
| **Fly.io** | Good performance; choose a region near users | Requires a card; the free allowance has shrunk | 🟡 Workable |
| **Railway** | Pleasant DX, simple setup | **No longer genuinely free** once trial credit is spent | 🟡 Budget-dependent |
| **Vercel serverless functions** | Same platform as the frontend | **Hard execution time limit**; a long AI reply will time out. Also a poor fit for a persistent Mongoose connection | ❌ Not advised |
| **Cloudflare Workers** | Very generous free tier; near-instant start | Not a full Node runtime — **Mongoose does not work** without a substantial rewrite | ❌ Not advised |
| **AWS Elastic Beanstalk** | Same ecosystem as existing AWS resources | **Bills per hour, including while idle** (see §0) | ❌ Stop using |

**The trade-off, stated plainly**: Render's ~50-second cold start is annoying,
but the alternative failure — a serverless platform cutting off an AI reply
mid-generation — is a feature that does not work at all. For this project a
cold start is an acceptable cost; an execution ceiling is not.

## 4. File storage: S3 → Cloudflare R2

R2 is S3-API compatible, so the existing `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner` code needs **almost no change**:

1. Point the client's `endpoint` at R2
   (`https://<account_id>.r2.cloudflarestorage.com`).
2. Set `region` to `auto`.
3. Swap in R2 access keys.

The practical difference is that **R2 does not charge for egress** and S3
does. For an application that serves resume downloads, that gap widens with
use.

## 5. S3 / R2 CORS configuration (required)

A browser uploading directly sends a preflight request first. **With no CORS
configuration on the bucket, uploads always fail** — and testing with `curl`
will not reproduce it, because `curl` does not enforce CORS.

The error looks like this:

```xml
<Error><Code>AccessForbidden</Code>
<Message>CORSResponse: CORS is not enabled for this bucket.</Message></Error>
```

The configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://<your-frontend-domain>"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

`AllowedOrigins` must list the frontend's **actual** URLs — both local
development and the production domain.

## 6. Email authentication (SPF, DKIM, DMARC)

Anyone can put any address in an email's `From` field. The three standards
below are how a receiving server decides whether to believe it. Together they
are what people mean by an email being "digitally signed".

| Standard | What it does | Where it lives |
| --- | --- | --- |
| **SPF** | Lists which servers are allowed to send for the domain | A TXT record on the domain |
| **DKIM** | Signs each message with a private key; the receiver verifies it against a public key in DNS. This is the actual cryptographic signature | A TXT record, plus signing at the provider |
| **DMARC** | Tells receivers what to do when SPF or DKIM fails, and where to send reports | A TXT record on `_dmarc.<domain>` |

**Why this is not configured yet**: all three require a domain you control.
The current sender is a `gmail.com` address, and only Google can sign for
`gmail.com`. Brevo works around this by rewriting the `From` address to one of
its own subdomains — which is why sent mail shows an address that is not the
one configured. Gmail and Outlook also now require authentication for bulk
senders, so an unauthenticated freemail sender is more likely to land in spam.

**How to fix it, when a domain is available:**

1. Register a domain.
2. In Brevo, go to *Senders, domains, IPs → Domains* and add it.
3. Add the DKIM and SPF records Brevo generates to the domain's DNS.
4. Add a DMARC record, starting at `p=none` to observe before enforcing.
5. Set `EMAIL_FROM_ADDRESS` to an address on that domain, for example
   `noreply@yourdomain.com`.

No application code changes — it is configuration and DNS.

## 7. Environment variables

Set these in the platform's environment settings. **Never** commit them. The
full field list is in `.env.example`.

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | Atlas connection string. The database name is case-sensitive |
| `JWT_SECRET` | ✅ | A long random string |
| `S3_BUCKET` | ✅ | Bucket name |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅ when uploads are used | R2 uses the same fields |
| `ANTHROPIC_API_KEY` | ❌ | Without it the chat returns 503; the service still runs |
| `BREVO_API_KEY` / `EMAIL_FROM_ADDRESS` | ❌ in development, ✅ in production | Without them, production email sending returns 503 |
| `EMAIL_SUPPORT_ADDRESS` | ❌ | Shown in the email footer; the line is omitted when unset |
| `APP_URL` | ❌ | Used for the link in the email footer |
| `CORS_ORIGINS` | ✅ in production | Comma-separated frontend origins, e.g. `https://careermate.pages.dev`. With none set in production, every browser request is rejected |
| `NODE_ENV` | ❌ | **Must be `production` in production**, or rate limiting is skipped |

> The sender address must be verified in Brevo under *Senders, domains, IPs*.
> An unverified sender is rejected with `Sender not valid`.

## 8. Pre-launch checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` replaced with a fresh random value, not the development one
- [ ] `CORS_ORIGINS` set to the production frontend origin (exact scheme and
      host; a subdomain is not implied)
- [ ] S3/R2 CORS includes the production frontend domain
- [ ] MongoDB Atlas network access allows the hosting platform's addresses
- [ ] The database name in `MONGODB_URI` matches the existing database exactly,
      including case
- [ ] Brevo sender verified, and `EMAIL_FROM_ADDRESS` set to it
- [ ] Frontend `REACT_APP_API_BASE_URL` points at the production backend,
      including `/v1`
