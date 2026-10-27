# BookLeaf Author Support & Communication Portal

Private full-stack implementation of the BookLeaf technical assignment. It
provides owner-scoped author books and tickets, a manual admin support workflow,
AI classification, and knowledge-grounded response drafts.

The supplied dataset is preserved as exactly 10 authors and 18 books. It has no
currency field, so monetary values are explicitly treated as INR. Null values
remain unavailable rather than becoming zero, while actual zero royalties are
shown as zero.

## Assignment coverage

### Author portal

- Email/password authentication with durable database sessions.
- Owner-scoped books dashboard, including books still in production.
- Book details include ISBN, genre, publication state/date, MRP, sales,
  royalties, payout date, print partner, platforms, and royalty per copy.
- Ticket creation for an owned book or General / Account Level.
- Required subject/description validation and truthful unavailable attachment UI.
- Paginated ticket list, original query, status, and public admin responses.
- Approximately five-second polling with hidden-page pause, cleanup, no
  overlapping requests, and graceful stale-data behavior.

### Admin portal

- All-author queue with status, category, priority, and inclusive UTC date
  filters, deterministic pagination, explicit severity sorting, and oldest-
  unresolved highlighting.
- All six required categories, four priorities, and four statuses.
- Assignment to self, manual category/priority overrides, status changes,
  private internal notes, and idempotent public responses.
- Audit actors/timestamps and explicit separation between Unclassified and
  General Inquiry.
- Saved AI drafts that admins can regenerate, edit, review, and explicitly send.

### Security and correctness

- Role and author identity come only from the authenticated server session.
- Author queries include the authenticated author ID; foreign and missing owned
  resources return the same generic 404 response.
- Author API projections exclude internal notes, assignments, AI runs, unsent
  drafts, credentials, and private processing details.
- Zod validates requests; database constraints protect ownership, idempotency,
  and draft/classification races.
- Duplicate ticket submissions and public-response retries do not create
  duplicate records.

## Architecture

```text
Browser UI
   │ REST + HttpOnly session cookie
Next.js Route Handlers
   │ authentication, role/origin checks, Zod validation
Service layer
   │ workflows and explicit author/admin response mapping
Repository layer ─────────────── Server-only AI providers
   │ Prisma                         │ bounded calls and strict outputs
PostgreSQL / Neon                   └ Gemini or OpenAI
```

The application uses Next.js 16 App Router, React, TypeScript, Tailwind CSS,
Prisma, PostgreSQL, Better Auth, and Zod. Route Handlers remain thin; business
rules, persistence, authentication, and AI are separate server modules.
PostgreSQL stores books, tickets, audit events, AI metadata, idempotency keys,
drafts, and sessions, so state survives Vercel function restarts.

## AI implementation and cost control

This trial implementation uses Google Gemini
`gemini-3.5-flash-lite`. Google documents it as a low-latency, cost-efficient
model with structured-output support, and its eligible Free Tier lists input
and output tokens as free of charge. Free Tier prompts and responses may be used
to improve Google products, so only approved trial data should be used. See the
[official model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
and [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

The provider can be changed without code changes. OpenAI `gpt-6-luna` is the
supported low-cost alternative. Official OpenAI documentation lists Standard
pricing at **$0.10 per 1M input tokens and $0.50 per 1M output tokens**. See the
[GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna).

Cost is constrained by design:

- Category and priority share one structured call with a 120-token output cap.
- Draft output is capped at 600 tokens. At Luna's listed Standard output price,
  600 output tokens cost at most $0.0003 before input and retry costs; the
  classification output cap costs at most $0.00006.
- Draft prompts include shared tone rules, one relevant knowledge-base section,
  verified facts, and at most five recent public responses.
- Stored drafts are reused; regeneration requires an explicit admin action.
- Default calls have a five-second timeout and one transient retry.
- Token usage, model, latency, prompt version, and knowledge-base version are
  recorded when the provider supplies them.
- Ticket creation is saved before AI runs, and manual classification/composing
  remains available after any timeout, rate limit, or malformed response.

Gemini configuration:

```text
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=<server-only Google AI Studio key>
```

Optional OpenAI configuration:

```text
LLM_PROVIDER=openai
LLM_MODEL=gpt-6-luna
OPENAI_API_KEY=<server-only OpenAI project key>
```

Leave `LLM_API_KEY` and the unused provider key empty. Never use a
`NEXT_PUBLIC_` prefix for any credential.

## Local setup

Prerequisites: Node.js 24, npm, and PostgreSQL. Docker Desktop can provide the
local PostgreSQL service.

```bash
npm install
cp .env.example .env
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d database
```

Edit `.env` and `.env.docker`. The database name, user, password, and port must
match; use `127.0.0.1` in the host-side `DATABASE_URL`. Generate a session secret
with:

```bash
openssl rand -base64 32
```

Required `.env` values:

```text
DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/<database>?schema=public
SESSION_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=http://localhost:3000
SEED_AUTHOR_PASSWORD=<temporary password, at least 12 characters>
SEED_ADMIN_EMAIL=<private demo admin email>
SEED_ADMIN_PASSWORD=<temporary password, at least 12 characters>
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=<optional server-only key>
LLM_TIMEOUT_MS=5000
LLM_MAX_RETRIES=1
```

Prepare the database and start the app:

```bash
npm run db:setup:demo
npm run dev
```

Open the exact origin in `BETTER_AUTH_URL`, normally
[http://localhost:3000](http://localhost:3000). The seed creates credentials only
for missing users and never resets existing password hashes.

## Tests

Tests use the configured PostgreSQL database, clean up their own marked ticket
fixtures, and mock provider behavior rather than spending AI quota.

```bash
npm run check
npm test
npm run build
```

The suite covers authentication, ownership, exact author books, null/zero
rendering, ticket creation and validation, admin authorization, filtering,
pagination, private-field exclusion, idempotency, AI failures, prompt injection,
manual-override races, and draft-edit races.
