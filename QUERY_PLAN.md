# MongoDB Query Remediation Plan

This plan is ordered by likely impact and implementation effort. It is restricted to the actual hot paths found in the code and is designed to be implemented only after approval.

## Priority 1: Add the missing composite indexes for the waitlist queue and expiry pipeline

- Files affected:
  - prisma/schema.prisma
  - src/app/modules/campWaitlist/campWaitlist.service.ts
  - src/helpars/autoSendWaitlistOffers.ts
  - src/helpars/expireWaitlistOffers.ts
- Fix:
  - Add a dedicated composite index to `CampWaitlist` for the queue and offer-expiry lookups:
    - `@@index([status, waitlistType, queuePosition])`
    - `@@index([status, offerExpiresAt])`
    - optionally, if the app frequently filters by session membership alongside status, consider `@@index([status, waitlistType, queuePosition, scheduleSessionIds])` only if MongoDB can support the array field in the same index without degrading other queries. Verify with explain() in real data because array-field ordering can be awkward in MongoDB.
  - Rewrite the queue lookup to read rows in a single batched query instead of `findFirst()` per expired row in the loop. The best pattern is to fetch the next queue candidates for all expiring entries in a single set of `scheduleSessionIds`/`waitlistType` groups, then promote them in a batch-oriented update.
  - Example pseudocode:
    - `const activeCandidates = await prisma.campWaitlist.findMany({ where: { status: "ACTIVE", waitlistType: ..., scheduleSessionIds: { hasSome: ... }}, orderBy: { queuePosition: "asc" }, select: { id: true, queuePosition: true, scheduleSessionIds: true } });`
    - then compute the next winner per session group and update many rows via `updateMany()` in batches rather than `findFirst()` per loop.
- Expected outcome:
  - avoids collection scans on large waitlists and converts the current N+1 queue promotion loop into a single batched selection pass
  - reduces expiry handling from O(expiredRows × activeRows) toward O(activeRows + expiredRows)
- Risk/effort: Low to Medium

## Priority 2: Eliminate the per-match N+1 fan-out in the reminder cron

- Files affected:
  - src/shared/cron.ts
- Fix:
  - Batch the recipient user IDs before the loop. Query all relevant `User` rows once using `id: { in: [...recipientIds] }` and filter by notification preference in one pass rather than calling `findMany` inside each match loop.
  - Aggregate the team-manager membership rows for all matches in a single query by `teamId` set, then map them back to the match data in memory.
  - Rewrite the loop to operate on a prepared recipient map and only do `notification.createMany` once per match, not per user lookup path.
  - Index recommendation: `@@index([isPublished, status, scheduledAt])` in `Match` (with equality fields first, then date range), or verify actual usage with explain() because the current order currently is `[isPublished, scheduledAt, status]` and the query uses `status: { in: ["SCHEDULED"] }` with a range on scheduledAt.
- Expected outcome:
  - cuts the reminder job from roughly 3–5 queries per match to 2–3 total queries for the full reminder window
  - reduces trigger time and avoids database spikes during reminder windows
- Risk/effort: Medium

## Priority 3: Add missing composite indexes for session-based membership checks

- Files affected:
  - prisma/schema.prisma
  - src/app/modules/schedule/schedule.service.ts
  - src/app/modules/campRegistration/campRegistration.service.ts
  - src/app/modules/campWaitlist/campWaitlist.service.ts
- Fix:
  - Add indexes for the membership/count patterns used on array-backed session IDs:
    - `@@index([status, scheduleSessionIds])` or, if supported for MongoDB array membership patterns, test `@@index([status, scheduleSessionIds])` vs `@@index([scheduleSessionIds, status])` with `explain()`.
    - For registration count lookups: `@@index([status, scheduleSessionIds])`
    - For waitlist queue membership: `@@index([status, waitlistType, queuePosition, scheduleSessionIds])` after verifying the array field order with explain() on real dataset characteristics.
  - Validate with `db.collection.explain("executionStats").find(...)` in MongoDB shell or Prisma raw query logs on a realistic dataset.
- Expected outcome:
  - reduces the need for full scans when counting or filtering registrations/waitlist rows by session membership and status
- Risk/effort: Medium

## Priority 4: Reduce nested list payloads and query fan-out in admin list screens

- Files affected:
  - src/app/modules/teamregistration/teamregistration.service.ts
  - src/app/modules/teaminvitation/teaminvitation.service.ts
  - src/app/modules/tournament/tournament.service.ts
- Fix:
  - Replace large nested includes with a smaller projection for index/list screens.
  - For list endpoints, only fetch the fields needed for the response table instead of deep nested `teamplayers`, `manager`, and `invitedTeams` payloads.
  - For tournament list screens, avoid complex nested relation filtering in the `where` clause when a denormalized filter or two-stage fetch can do the same work with less database pressure.
- Expected outcome:
  - reduces payload size and memory usage on list pages, especially for collection sizes common in admin screens
- Risk/effort: Low to Medium

## Priority 5: Batch invite creation and notification generation

- Files affected:
  - src/app/modules/teaminvitation/teaminvitation.service.ts
- Fix:
  - Replace the per-team `findFirst()` duplicate-check and per-team manager fetch with a batched query over all candidate team IDs and a single `notification.createMany()` payload for all recipients.
  - Example approach:
    - fetch all relevant `teamManager` rows once: `where: { teamId: { in: teamIds } }`
    - fetch all existing `teaminvitation` invites for the same tournament/division in one query and dedupe in memory
    - create the invite rows in one bulk call or with a transaction that is still short-lived
- Expected outcome:
  - converts invite creation from O(teams) DB operations to O(1)/few queries while preserving the same business logic
- Risk/effort: Medium

---

## Recommended indexes to create

1. `CampWaitlist` — `@@index([status, offerExpiresAt])`
   - Justification: serves `findMany({ where: { status: "OFFER_SENT", offerExpiresAt: { lt: now } } })` in `expireWaitlistOffers()`.

2. `CampWaitlist` — `@@index([status, waitlistType, queuePosition])`
   - Justification: serves `findFirst({ where: { scheduleSessionIds: { has: primarySessionId }, waitlistType, status: "ACTIVE" }, orderBy: { queuePosition: "desc" } })` and adjacent queue scans in the waitlist flow.

3. `Match` — `@@index([isPublished, status, scheduledAt])`
   - Justification: matches the reminder query `where: { isPublished: true, scheduledAt: { gte: ..., lt: ... }, status: { in: ["SCHEDULED"] } }` more closely than the current `[isPublished, scheduledAt, status]` layout.

4. `CampRegistration` — `@@index([status, scheduleSessionIds])`
   - Justification: supports membership/count checks such as `scheduleSessionIds: { has: session.id }` combined with `status: "CONFIRMED"` and other registration filters.

5. `CampWaitlist` — `@@index([status, scheduleSessionIds])`
   - Justification: supports `scheduleSessionIds: { hasSome: ... }` plus status-based filtering for waitlist offer selection and admin dashboards.

6. `Teaminvitation` — `@@index([userId, toTournamentId, toTournamentDivisionId, status])`
   - Justification: matches the duplicate-check lookup in `createTeaminvitation()` and prevents repeated scans of invitation records during bulk invites.

7. `User` — `@@index([status, lastLoginAt])`
   - Justification: improves the inactivity sweep `where: { lastLoginAt: { lt: threeMonthsAgo }, status: "ACTIVE" }` in the user status cron job.

> Important: these are not hypothetical suggestions. Each one maps directly to a real query pattern found in the repository and should be validated with `explain()` on a real dataset before deployment because MongoDB array-field and compound-index behavior can vary significantly with data distribution and array size.
