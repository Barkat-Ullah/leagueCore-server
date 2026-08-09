# PERFORMANCE PLAN — LeagueCore Tournament Server

**Companion doc:** `PERFORMANCE_AUDIT.md`
**Status:** Phase 0 (docs) done — awaiting approval before code changes.
**Guiding principles:** preserve all functionality; no breaking API contracts unless
absolutely necessary; prosecute highest ROI first (high impact / low risk → high impact /
medium risk → everything else); avoid premature optimization; add tests.

**Prioritization key:** ROI = Impact ÷ (Risk + Effort). Categories:
- **P1**: high impact / low risk
- **P2**: high impact / medium risk
- **P3**: everything else

---

## Phase 0 — Documentation (COMPLETE)
- [x] `PERFORMANCE_AUDIT.md` created (findings with IDs A1–E8).
- [x] `PERFORMANCE_PLAN.md` created (this file).
- [ ] **GATE: wait for user approval before implementing Phase 1.**

---

## Phase 1 — High Impact / Low Risk

### 1.1 Add missing database indexes  *(P1, additive, no behavior change)*
Edit `prisma/schema.prisma`, then run `prisma db push` (or generate a migration) and `prisma generate`.

| Model | Index / unique to add |
|---|---|
| User | `userName @unique`; `@@index([createdById])`; `@@index([role, status, lastLoginAt])` |
| Tournament | `@@index([userId, tournamentStage, isDeleted])`; `@@index([registrationDeadline, status])` |
| Teams | `@@index([coachId])`; `@@index([managerId])`; `@@index([tournamentId])`; `@@index([division])` |
| teamregistration | `@@index([userId])`; `@@index([teamId])`; `@@index([tournamentId])`; `@@index([teamDivisionId])`; `@@index([teamName])` |
| teamplayer | `@@index([playerId])`; `@@index([teamregistrationId])`; `@@index([userId])`; `@@index([isDeletedTeamPlayer])` |
| Teaminvitation | `@@index([toTournamentId, toTournamentDivisionId, status])`; `@@index([coachId])` |
| Notification | `@@index([userId, read, createdAt])` |
| Match | `@@index([tournamentId, stage, status])`; `@@index([homeTeamId])`; `@@index([awayTeamId])`; `@@index([isPublished, scheduledAt, status])` (cron) |
| teamplayer | add `waiverSentAt DateTime?` to support B2 dedupe |
- **Expected gain:** eliminates collection scans on every hot read; typically 10–100× on filtered reads depending on collection size. **Risk:** low (writes on tables with few docs).

### 1.2 Kill N+1 query loops  *(P1)*
- **B1 match reminders** (`cron.ts`): gather all candidate user/manager ids from matches,
  issue 3 batched `findMany({ id in ... })`, then one `notification.createMany`.
- **B2 waiver alerts** (`cron.ts`): select teamplayers where `waiverSentAt = null`
  (new field from 1.1), batch insert notifications, then stamp in bulk `updateMany`.
  Removes the ~2000 regex `findFirst` scans.
- **B3 `autoSendWaitlistOffers`**: query only sessions with `totalRegistered < capacity`
  and `totalGoalieRegistered < goalieSlots`; batch per-session checks.
- **B4 `expireWaitlistOffers`**: one `updateMany` to expire, then a single transaction for
  the next-in-queue cascade.
- **B5 `sendNotificationToGroup`**: `findMany({ id in users })`, FCM multicast, `createMany`.
- **B6 `createTeaminvitation`**: pre-fetch existing invites with one `findMany`; bulk create.
- **B8 `getCampOverview`**: consolidate via aggregation; add short-TTL cache (see 1.6).

### 1.3 Singleton + async email  *(P1)*
- Create one shared nodemailer transporter (module-level) in `emailSender.ts`; remove
  per-call `createTransport`.
- Change call sites (`addPlayer`, `inviteManager`, `createUserIntoDb`, OTP flows, camp
  register) to **fire-and-forget** (`.catch` handled) so SMTP no longer holds responses open.
- Fix empty Brevo credentials/`from` in `.env` (config currently empty → sends fail).
- **Gain:** callers stop waiting ~100–500ms on SMTP; lower memory (single pool).

### 1.4 Trim auth & user lookups; cache admin id  *(P1)*
- `auth.ts` / `optionalAuth.ts`: add `select` to `user.findUnique` (id, status, suspendedUntil,
  isDeleted, role/createdBy only) so password/OTP/FCM are never parsed per request.
- Cache the admin id (`prisma.user.findFirst({role: ADMIN})`): lazy singleton in a helper
  (`getAdminId()`), invalidated after admin create/delete. Removes ~12 duplicate queries.
- **Gain:** lower per-request CPU + safe over-fetch removal.

### 1.5 Reduce / offload bcrypt  *(P1)*
- Lower invite-flow cost (e.g. 12 → 10) and prefer native `bcrypt` over `bcryptjs`
  where possible; keep hashing out of the synchronous request path where feasible.
- **Gain:** frees ~300ms of event-loop per hash.

### 1.6 Scope pagination & payloads  *(P1)*
- Paginate `notification`, `referee` (re-enable `skip`/`take`), `series`.
- Trim `getTeamregistrationList` / `getTournamentList` nested includes; run `count` inside
  `Promise.all` with `findMany`.
- **Gain:** bounded responses; fewer/subquery-less pages.

### 1.7 Hygiene  *(P1)*
- Fix `server.ts` TDZ bug (`restartServer` referenced before init).
- Remove dead `websocket.server.ts` from the shipped build (or leave import out).
- Gate / remove prod `console.log(data, file)` and `console.table`.
---

## Phase 2 — High Impact / Medium Risk

### 2.1 Externalize cron  *(P2)*
- Replace `node-cron` with **Vercel Cron** (or external scheduler) calling one idempotent
  "run-jobs" endpoint; keep job logic in a shared module. Removes per-instance duplication and
  scale-to-zero misses. **Risk:** deploy config + idempotency must be validated.

### 2.2 Serverless-safe Prisma  *(P2)*
- Single shared client + connection reuse across invocations; optional serverless driver
  adapter/Prisma Accelerate. **Risk:** connection pooling behavior under concurrency.

### 2.3 Reliable rate limiting  *(P2)*
- Back the limiter with a shared store (Upstash/Redis) and validate the trusted proxy IP.
  **Risk:** infra dependency + behavior change.

### 2.4 Compression + cache headers + body limits  *(P2)*
- Add `compression` (gzip/brotli) for JSON; set `Cache-Control` on stable responses;
  raise `express.json({ limit })`; stream uploads instead of full in-memory buffering.

---

## Phase 3 — Everything Else

### 3.1 Background queue  *(P3/optional)*
- Introduce BullMQ (Redis/Upstash) for emails, FCM, points-award, notification fan-out.

### 3.2 Read caching  *(P3/optional)*
- In-process + optional Redis cache for standings, leaderboard, camp overview with explicit
  invalidation on score/registration mutations.

### 3.3 Single source of truth for standings
- Unify `getDivisionStandings`, `computeGroupStandings`, `getTeamTournamentDetails` into one
  shared, cached module.

### 3.4 Idempotent webhooks
- Ledger for Stripe `event.id`; process async; acknowledge fast.

### 3.5 Tests
- Add Vitest harness: pure helpers (`buildAllPairs`, `resolvePlacements`,
  `computeGroupStandings`, refund calc), cron batch logic, and an API/webhook smoke test.
  Wire `npm test`.

### 3.6 Hygiene/CI
- Clean `dist/` from VCS; add `.nvmrc`; document env; trim unused deps (`aws`, `aws-sdk`,
  `socket.io`, `ws` if unused).

---

## Expected gains (targets)
| Metric | Phase 1 | Phase 1+2 |
|---|---|---|
| Read-query latency (indexed paths) | 10–100× fewer scans | — |
| Per-request DB round-trips (auth) | −1/−2 lookups + safe payload | — |
| Cold start | −600ms+ (remove startup bcrypt/seed) | further with Prisma/queue |
| Endpoint p95 (list/dashboard) | −30–70% (batch + pagination) | more with compression |
| Cron daily DB load | −90%+ (no more 2000× regex scans) | — |
| Infrastructure cost | lower CPU/mem per request | fewer invocations via cron |

## Rollout / validation
- Apply Phase 1 with `git` checkpoints per item; run `npm run build` after each.
- Add the Vitest harness early (3.5 pulled into Phase 1 tail) so each change is guarded;
  verify with `npm test` + manual endpoint smoke.
- Deploy to preview, confirm behavior parity, then production.

---

**Approval gate:** Phase 1 implementation starts only after you approve this plan.