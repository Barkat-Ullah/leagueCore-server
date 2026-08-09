# PERFORMANCE AUDIT — LeagueCore Tournament Server

**Scope:** Full-stack performance audit of the LeagueCore tournament-management API.
**Date:** 2026-08-09
**Auditor:** Principal Software Architect / Performance Engineer
**Status:** Findings complete — Phase 0 (documentation only, no code changed yet)

---

## 1. Architecture Snapshot

| Concern | Detail |
|---|---|
| Language / runtime | TypeScript → CommonJS, Node.js (`target: es2016`) |
| HTTP framework | Express 4.19 |
| ORM / DB | Prisma 6.9 on **MongoDB Atlas** (driver `mongodb`) |
| Validation | Zod 3 (async `parseAsync` in middleware) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` (cost 12) |
| Payments | Stripe (webhook) + PayPal |
| Uploads | DigitalOcean Spaces (S3 SDK) + Cloudinary (multer in-memory) |
| Email | Nodemailer → Brevo relay |
| Push | Firebase Admin (FCM) |
| Realtime | `ws` + `socket.io` — **disabled** (`setupWebSocket` commented out in `server.ts`) |
| Scheduled work | `node-cron` (7 jobs) |
| Tests | **None** (`npm test` is a stub) |
| Deployment | Single **Vercel serverless** function (`@vercel/node`, `dist/server.js`) |
| Cache | **None** (no Redis, no in-memory cache) |
| Queue | **None** (no BullMQ/Bee/Kafka/SQS/worker) |

Modules audited (14 route modules, ~13,300 lines of service code): auth, user, player,
coach, referee, teamregistration, teamplayer, teaminvitation, tournament, series, schedule,
campRegistration, campWaitlist, notification, payment + `helpars/*`, `shared/*`, middleware.

---

## 2. Key Metric Hotspots (by estimated impact)

| ID | Finding | Est. impact | Root cause | Risk |
|----|---------|-------------|-----------|------|
| A1 | Serverless + long-running infra mismatch (cron, WS, rate-limit) | Critical (correctness + scale) | Stateless functions can't host per-instance crons/WS/limiters | High |
| A2 | Heavy Prisma startup on every import/cold start (2× bcrypt-12 hash + 2 lookups + `$connect`) | High (cold start +600ms) | `connectPrisma()` side effects at module load | Low |
| B1 | Cron match-reminder N+1 (4 queries/match) | High at scale | Per-match sequential lookups | Low |
| B2 | Cron waiver-alert N+1 + regex dedupe (up to 2,000 sequential scans) | Critical daily load | Per-player `findFirst` with `data contains` | Low |
| B3 | `autoSendWaitlistOffers` full-scan + N queries | Medium-high | Loads ALL sessions; per-session queries | Low |
| B4 | `expireWaitlistOffers` transaction per expired row | Medium | Row-by-row processing | Low |
| B5 | `sendNotificationToGroup` N+1 (user+FCM+create per id) | Medium-high | Per-user loop | Low |
| B6 | `createTeaminvitation` N+1 dedupe+create | Medium | Per-team loop in tx | Low |
| B7 | `generateUsername` unbounded `while(findFirst userName)`; `userName` not unique/indexed | Medium | No unique constraint; scan per iteration | Low |
| B8 | `getCampOverview` N queries/week + multiple aggregates | Medium | Per-week `findMany` | Medium |
| C  | Missing indexes across 6+ hot collections + regex `contains` searches | **Critical (read path)** | Schema lacks composite indexes; case-insensitive = regex | Low |
| D1 | `auth`/`optionalAuth` fetch full user doc (password, OTP, FCM) on every request | Medium-high (security+CPU) | `findUnique` without `select` | Low |
| D2/D3/D4 | Unpaginated notification/referee/series endpoints | Medium | Missing `take`/`skip` | Low |
| D5/D6 | Deep nested list includes + per-row subqueries + separate `count` | Medium | Over-fetching | Low |
| E1 | Per-call nodemailer transporter + inline `await` SMTP in request path | Medium | Transporter built every send; sync send | Low |
| E2 | bcrypt cost 12 on request path (bcryptjs blocks event loop ~300ms) | Medium (CPU) | Hash in hot path | Low |
| E3 | `prisma.user.findFirst({role:ADMIN})` repeated ~12× | Medium | No caching of admin id | Low |
| E4 | `getEffectiveAccessId` = 2nd user lookup per request | Medium | Redundant with auth-mw | Low |
| E5 | Heavy webhook logic inline, no idempotency/dedupe | Medium | Sync processing | Medium |
| E8 | No compression, no cache headers, 100kb body limit | Medium | Config gap | Low |

> **Overall root cause:** (1) a stateful, long-lived server pattern running on stateless
> serverless infra; (2) pervasive N+1 + full-collection scans driven by missing indexes and
> regex `contains`; (3) blocking (bcrypt, SMTP) and duplicated work (admin lookup, per-call
---

## 3. Detailed Findings

### 3.1 Platform / Lifecycle (A)

**A1 — Serverless + long-running mechanisms.**
`server.ts` runs `app.listen` on boot; `src/shared/cron.ts` registers 7 `node-cron` jobs per
instance. On Vercel serverless: functions scale to zero (cron never runs), and under
concurrency each warm instance duplicates jobs. The WebSocket server
(`src/app/modules/websocket/websocket.server.ts`) keeps in-memory `Map`s of sockets that
cannot span instances — it is currently commented out, so its code ships dead weight and is
never functional. Rate limiting (A4) has the same per-instance problem.

**A2 — Prisma startup side effects.**
```ts
// src/shared/prisma.ts
const prisma = new PrismaClient();
async function connectPrisma() {
  await prisma.$connect();
  initiateSuperAdmin();      // bcrypt.hash(..., 12)  ~300ms blocking
  initiateAnotherAdmin();    // bcrypt.hash(..., 12)  ~300ms blocking
}
connectPrisma();             // runs on every module import / cold start
```
Two bcrypt-12 hashes + 2 lookups + optional writes execute synchronously (bcryptjs is
CPU-bound on the main thread) on **every cold start**.

**A3 — Seed on boot.** `main()` calls `seedSeries()` (3 upserts) every boot.

**A4 — In-memory rate limit on serverless.** `express-rate-limit` default MemoryStore is
per-invocation; `keyGenerator` trusts the first `x-forwarded-for` (spoofable).

### 3.2 Database — Indexes (C)

Current index coverage (`prisma/schema.prisma`):

| Model | Existing | Missing (hot) |
|---|---|---|
| User | `email @unique` | `userName` (add unique), `createdById`, `role/status/lastLoginAt` (cron) |
| Tournament | — | `userId`, `tournamentStage/status/isDeleted`, `registrationDeadline` |
| Teams | — | `coachId`, `managerId`, `tournamentId`, `division` |
| teamregistration | — (none) | `userId`, `teamId`, `tournamentId`, `teamDivisionId`, `teamName` |
| teamplayer | `@@unique([playerId, teamregistrationId])` | `playerId`, `teamregistrationId`, `userId`, `isDeletedTeamPlayer` |
| Teaminvitation | — | `toTournamentId`, `toTournamentDivisionId`, `status`, `userId`, `coachId` |
| Notification | — | `userId/read/createdAt` |
| Match | `@@index([divisionId, scheduledAt])` | `tournamentId`, `homeTeamId/awayTeamId`, `stage/status`, `scheduledAt` window |
| schedulePeriod/Week/Session | all present | ok |
| campRegistration/Waitlist | all present | ok |
| SeriesPointsLedger | good (composite unique) | ok |

All `searchTerm` filters use `mode: "insensitive"` → Prisma emits a **case-insensitive regex**
that cannot use a plain index → full collection scans on 14 modules.


### 3.3 Application Layer — N+1 and loops (B)

- **B1** `cron.ts` match reminders: for each match, 4 sequential `findMany`/`in` queries (coaches,
  players, manager-candidates, manager-users), then one `notification.createMany`. Batch across all matches.
- **B2** `cron.ts` waiver alerts: ~2000 teamplayer rows fetched, then per row a
  `notification.findFirst({ data: { contains: "...teamregistrationId...playerId..." } })` regex scan.
  Replace with a stamped/idempotency field (e.g. `waiverNotifiedAt` on teamplayer) and `createMany`.
- **B3** `autoSendWaitlistOffers`: `scheduleSession.findMany()` unfiltered, then per session
  `findMany` + `findFirst`. Filter to sessions with available capacity; batch.
- **B4** `expireWaitlistOffers`: one 3-op transaction per expired row → use `updateMany` + a single transaction.
- **B5** `notification.service.sendNotificationToGroup`: per user `findUnique` + FCM send + `create`.
  Use `findMany({id in})`, FCM multicast, and `notification.createMany`.
- **B6** `teaminvitation.createTeaminvitation`: per team `findFirst` (dup check) + `create` in tx.
  Pre-fetch with one `findMany({ id in })`, then bulk `createMany`/nested create.
- **B7** `generateUsername`: `while (findFirst({userName}))` — no unique index, unbounded scan per iteration.
- **B8** `campRegistration.getCampOverview`: per-week `findMany`, plus several separate
  `aggregate`/`count` calls → consolidate via aggregation; short-TTL cache.

Shared hot-path duplication:
- **E3** `prisma.user.findFirst({ role: ADMIN })` appears in ~12 functions (createTournament,
  createTeamregistration, createTeamplayer, updateTeamplayer, publish, refunds, createUser, etc.).
  Cache a single admin id at module load / on first use, invalidate on admin changes.
- **E4** `getEffectiveAccessId(req.user.id)` adds a second `user.findUnique` per request.

### 3.4 Over-fetching / Pagination / Payload (D)

- **D1** `middlewares/auth.ts`, `optionalAuth.ts`: `prisma.user.findUnique({ where: { id } })` with no
  `select` returns the full document (incl. `password`, `otp`, `fcmToken`) and is run on every
  authenticated request (auth-mw + `getEffectiveAccessId`).
- **D2** `notification.getAllNotifications` / `getAllUnreadNotificationsByUser`: no `take`/`skip`.
- **D3** `refereeService.getRefereeList`: pagination commented out — returns every referee.
- **D4** `seriesService.getSeriesByUserId`: `findMany()` with no filter.
- **D5** `teamregistrationService.getTeamregistrationList`: deep include of coach + team+manager +
  tournament + division + **all teamplayers with full player profiles**, plus a separate `count`.
- **D6** `tournamentService.getTournamentList`: `include tournamentDivisions` + `_count` per row;
  `count()` runs serially after `findMany` instead of `Promise.all`.

### 3.5 Blocking I/O & CPU (E)

- **E1** `shared/emailSender.ts` builds a **new transporter on every send** (`nodemailer.createTransport`)
  and every caller `await`s it inline in the request path (addPlayer, inviteManager, createUserIntoDb,
  login-OTP, resendOtp, forgotPassword, camp register). SMTP round-trip holds the HTTP response open.
  Brevo `auth`/`from` are empty in `.env`, so sends are likely failing.
- **E2** bcrypt-12 hashing blocks the event loop in `addPlayer`, `createTeamplayer`,
  `createUserIntoDb`, `inviteManager`. Recommend lower cost for invite flows + offload.
- **E5** Stripe webhook (`shared/stripeWebhook.ts`) runs both handlers serially, each doing heavy
  DB work inline; no explicit delivery-idempotency ledger.
- **E6** `validateRequest.ts`: `JSON.parse` on `req.body.data` + `schema.parseAsync`; use `safeParse`.
- **E7** `console.log(data, file)` / `console.table` in prod code paths (createTournament, series) — remove or gate by env.
- **E8** No `compression`, no `helmet`, no cache headers; `express.json()` default 100 KB limit;
  multer buffers uploads fully in memory before pushing to S3/Cloudinary.

### 3.6 Caching / Queues / Infra

- **No read caching** anywhere; standings, leaderboard, camp overview are recomputed on every call.
- **No background queue**; emails/FCM/points/notifications are inline.
- No `cluster`, PM2, or worker config; serverless connection strategy unimplemented.
- `dist/` is committed; `public/` is empty (no in-repo frontend / asset pipeline).

### 3.7 Code-quality note (adjacent bug)
`server.ts` uses `restartServer` inside `exitHandler` before the `const restartServer`
initialization executes — a Temporal Dead Zone risk when the handler runs.

---

## 4. Recommended Fixes (summary)

1. **Indexes first** — additive, zero code-behavior change, biggest read-path win.
2. **Batch all N+1 loops** (crons, notifications, waitlist, invitations) with `in`-queries,
   `createMany`, and single transactions.
3. **Async, singleton emailing** (+ fix Brevo config) and remove inline SMTP `await`.
4. **Trim auth `select`** so the password hash is never returned/parsed per request;
   cache admin id.
5. **Reduce/offload bcrypt** in create flows; pre-seed admins (skip per-cold-start hashing).
6. **Paginate / scope** unbounded list endpoints and deep includes.
7. **Decouple cron to Vercel Cron** (or external scheduler) calling one idempotent job endpoint.
8. Add `compression` + response cache headers; raise body limit; stream uploads.
9. Serverless-safe Prisma client sharing / connection strategy.
10. Optional: Redis-backed read cache + rate limit + background queue.

Full fix details, ordering, expected gains, and risk are in **PERFORMANCE_PLAN.md**.

> transporter, re-derived standings) in the request/webhook hot path.