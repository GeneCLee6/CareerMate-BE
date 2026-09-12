# CareerMate-BE

The backend API for CareerMate AI: accounts, profiles, resume files and AI
conversations.

The frontend lives in
[CareerMate-FE](https://github.com/GeneCLee6/CareerMate-FE).

## Documentation

| Document | Contents |
| --- | --- |
| [`PRD.md`](./PRD.md) | Product requirements, user stories, acceptance criteria, known gaps |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layering, data models, AI design, error contract |
| [`RULES.md`](./RULES.md) | Engineering conventions, naming, testing, branch/PR/CI rules |
| [`DEPLOY.md`](./DEPLOY.md) | Hosting comparison, configuration, email authentication |

## Stack

Node.js · Express 5 · MongoDB (Mongoose) · zod · JWT · AWS S3 ·
Claude (`@anthropic-ai/sdk`) · Brevo · Jest

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, S3_BUCKET
npm run dev            # http://localhost:3000
```

You need a MongoDB instance (local, or an Atlas connection string). The
database name in `MONGODB_URI` is case-sensitive: MongoDB refuses to create a
database whose name differs from an existing one only by case, and the failure
surfaces as an opaque 500 on the first write.

Three optional keys change what works; the server starts without any of them:

| Missing key | What happens |
| --- | --- |
| `ANTHROPIC_API_KEY` | `/v1/chat/status` reports `configured: false`; sending a message returns 503 |
| `BREVO_API_KEY` / `EMAIL_FROM_ADDRESS` | Outside production, emails are written to the log instead of sent, so the verification flow stays testable. In production, sending returns 503 |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development mode with nodemon |
| `npm start` | Production start |
| `npm test` | Run the test suite |
| `npm run test:watch` | Watch mode |
| `npm run email:preview` | Render every transactional email to `tmp/email-preview` without sending |

## API surface

Base path `/v1`. Everything except `/auth/*` requires
`Authorization: Bearer <token>`.

| Group | Endpoints |
| --- | --- |
| `auth` | register, verify-email, resend-verification, login, forgot-password, verify-code, reset-password |
| `users` | me (GET/PUT), me/password, me/avatar |
| `upload` | presigned-url |
| `resumes` | create, list, download, delete |
| `chat` | status, conversations, messages |

Registration does **not** return a token: the account is created unverified,
a six-digit code is emailed, and `login` answers 403 until that code is
entered. See [`PRD.md`](./PRD.md) §3 for the full contract.

## Tests

```bash
npm test
```

Tests need no keys. They never reach a real database and never call Anthropic
or Brevo — every external service is mocked, so the suite costs nothing to run
and is safe in CI.
