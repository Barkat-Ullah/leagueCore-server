# MongoDB Query Performance Audit

This repository uses Prisma over MongoDB, so the findings below reference Prisma queries and the indexes declared in prisma/schema.prisma. I verified the schema and the hot query paths in the app, cron jobs, and background helpers before documenting issues.

## Summary

- Total query hotspots reviewed: 12
- Critical: 4
- High: 5
- Medium: 2
- Low: 1
- Worst offenders:
  - src/helpars/expireWaitlistOffers.ts: repeated per-expired-row query loop and missing composite index on waitlist expiry state
  - src/shared/cron.ts: per-match recipient lookups in match-reminder cron
  - src/app/modules/teaminvitation/teaminvitation.service.ts: per-team invitation loop plus nested manager-notification queries
  - src/app/modules/campWaitlist/campWaitlist.service.ts: waitlist queue lookups without supporting composite index

### Verified index state

The schema already defines useful single-field indexes on common lookup keys such as User.email, Tournament.userId, Match.divisionId, Teamregistration.tournamentId, CampRegistration.schedulePeriodId, etc. The hot spots below are not primarily about missing single-field indexes; they are about missing composite indexes and inefficient query shape for the real filters/sorts used in production.

---

## Critical

### src/helpars/expireWaitlistOffers.ts:8-46

- Query: `prisma.campWaitlist.findMany({ where: { status: "OFFER_SENT", offerExpiresAt: { lt: now } }, ... })` and inside the loop `prisma.campWaitlist.findFirst({ where: { scheduleSessionIds: { hasSome: item.scheduleSessionIds }, waitlistType: item.waitlistType, status: "ACTIVE", queuePosition: { gt: item.queuePosition } }, orderBy: { queuePosition: "asc" } })`
- Triggered by: cron helper `expireWaitlistOffers()` run from the app cron scheduler
- Issue(s):
  - Critical: Missing composite index on `(status, offerExpiresAt)` for expiry sweep
  - Critical: N+1 query pattern inside `for (const item of toExpire)`
  - High: Missing composite queue index for `status + waitlistType + queuePosition` and possible `hasSome` array predicate mismatch
- Why it's slow: The expiry sweep has to scan all OFFER_SENT waitlist rows to find anything expired, but the schema has no index on the real expiry filter (`status` + `offerExpiresAt`). After it identifies expired rows, it does an additional DB lookup for each expired row to find the next queued waitlist entry. With large waitlists, this degenerates into O(expiredRows × activeRows) and can be an expensive per-cron batch.
- Estimated impact: full collection scan across the waitlist table for every cron tick; in a busy camp season this becomes an N+1 queue walk for each expired offer, often tens of extra reads per expired record.

### src/shared/cron.ts:92-219

- Query: `prisma.match.findMany({ where: { isPublished: true, scheduledAt: { gte: windowStart, lt: windowEnd }, status: { in: ["SCHEDULED"] } }, select: { ... } })` followed by per-match lookups:
  - `prisma.user.findMany({ where: { id: { in: coachCandidateIds }, status: "ACTIVE", isDeleted: false, isMatchReminderNotify: true }, ... })`
  - `prisma.user.findMany({ where: { id: { in: playerCandidateIds }, status: "ACTIVE", isDeleted: false, isMatchReminderNotify: true }, ... })`
  - `prisma.teamManager.findMany({ where: { teamId: { in: teamIds } }, select: { managerId: true } })`
  - another `prisma.user.findMany(...)` for managers
- Triggered by: cron task `sendMatchRemindersTMinus6H` in `startCrons()`
- Issue(s):
  - Critical: N+1 pattern in `for (const m of matches)` with repeated per-match recipient queries
  - High: index order mismatch for `Match` query (`@@index([isPublished, scheduledAt, status])` is not aligned to actual query shape with equality + range + equality)
  - Medium: repeated recipient-group fetches could be batched by `in` set and a single lookup per user type
- Why it's slow: The code fetches a small set of scheduled matches, then for each match does 3-4 extra user/team-manager lookups to determine recipients. This is the classic per-match fan-out problem. Prisma/Mongo is forced to do repeated query rounds even though the requested user IDs are known once for the matching window.
- Estimated impact: for 50 matches in a reminder window, this can explode to 150–250 additional database reads plus nested team and user lookups depending on roster size.

### src/app/modules/campWaitlist/campWaitlist.service.ts:24-46

- Query: `prisma.campWaitlist.findFirst({ where: { scheduleSessionIds: { has: primarySessionId }, waitlistType, status: "ACTIVE" }, orderBy: { queuePosition: "desc" } })`
- Triggered by: `joinWaitlist()` when a family joins the waitlist
- Issue(s):
  - Critical: Missing composite index for `status + waitlistType + queuePosition` and array predicate on `scheduleSessionIds`
  - High: `scheduleSessionIds` array field is indexed only as a single field; query uses `has` on a specific session plus queue ordering
- Why it's slow: The queue position is derived by scanning all active waitlist items for the same waitlist type and session, and then ordering by queuePosition descending. The schema has `@@index([scheduleSessionIds])` and `@@index([parentEmail])`, but no index that matches the actual queue lookup pattern. For large waitlists this can become a full scan of the active waitlist segment.
- Estimated impact: full scan of active waitlist rows for the relevant session type when queue size is large; on a large camp cycle this can be a noticeable hot path on create/write throughput.

### src/app/modules/teaminvitation/teaminvitation.service.ts:57-100

- Query: inside the transaction, for each team it does `tx.teaminvitation.findFirst({ where: { userId: userId, toTournamentId: toTournamentId, toTournamentDivisionId: payload.toTournamentDivisionId, status: { in: ["PENDING", "ACCEPTED"] }, invitedTeams: { some: { teamId: t.id } } } })`
- Triggered by: `createTeaminvitation()` admin route
- Issue(s):
  - Critical: N+1 inside a loop over `teams` during invite creation
  - High: duplicate-check query is not covered by the current index set (index exists on `[toTournamentId, toTournamentDivisionId, status]` but not on `userId` + teamId relation semantics)
  - Medium: the same route also queries managers per team and creates notifications per team in a loop
- Why it's slow: Each team triggers another `findFirst` against `teaminvitation` and often another lookup against `teamManager` and `notification` ops. This works for a few teams but scales poorly when a tournament-wide invite is sent to many teams or when the invite list is large.
- Estimated impact: with 50 invited teams, the duplicate check and fan-out mail/notification data can lead to dozens more reads and writes than a batched insert approach.

---

## High

### src/helpars/autoSendWaitlistOffers.ts:5-60

- Query: `prisma.scheduleSession.findMany({ include: { scheduleWeek: true } })`; then `prisma.campWaitlist.findMany({ where: { scheduleSessionIds: { hasSome: availableSessionIds }, status: "ACTIVE" }, orderBy: { queuePosition: "asc" } })`; then `prisma.campWaitlist.update({ where: { id: entry.id }, ... })` in a loop
- Triggered by: cron helper `autoSendWaitlistOffers()`
- Issue(s):
  - High: large `hasSome` array predicate on `scheduleSessionIds` with no compound status+queue index
  - Medium: update loop per available session (small, but still per-session writes)
  - Medium: reads all sessions and then scans waitlist rows for all available session IDs before each offer assignment
- Why it's slow: The code loads all sessions and all active waitlist entries whose session IDs overlap the available set, then iterates through available sessions one-by-one. There is no compound waitlist index that matches `scheduleSessionIds + status + queuePosition`, so MongoDB must do more work than necessary to route offers to the correct next-in-line row.
- Estimated impact: the query fan-out is bounded by the number of available sessions, but a waitlist with thousands of entries can still trigger a large full-segment scan before bids are resolved.

### src/app/modules/teamregistration/teamregistration.service.ts:592-650

- Query: `prisma.teamregistration.findMany({ skip, take, where, orderBy: { createdAt: "desc" }, select: { ... teamplayers: { select: { ... player: { select: ... }}, orderBy: { createdAt: "desc" } } } })`
- Triggered by: `getTeamregistrationList()` for coach/manager/admin listing
- Issue(s):
  - High: heavy nested include and large document shape
  - Medium: repeated nested relation data for every result row (coach, team, tournament, tourDivision, teamplayers, nested player)
  - Low: collection-level pagination is present, so not unbounded, but the projection is still larger than needed for list screens
- Why it's slow: The list query includes multiple nested relations and nested player details. Each result row can hydrate a large object graph, which is expensive in MongoDB when the app only needs a subset for the listing view.
- Estimated impact: each page fetch can carry a much larger payload than needed, increasing CPU, memory, and network latency; the effect depends on how many players each team has.

### src/app/modules/teaminvitation/teaminvitation.service.ts:129-180

- Query: `prisma.teamManager.findMany({ where: { teamId: team.id }, select: { manager: { select: { id: true, email: true } } } })` and then `prisma.notification.createMany({ data: managerIds.map(...) })` inside a loop over each invite created
- Triggered by: `createTeaminvitation()` after creating each invitation row
- Issue(s):
  - High: per-team manager lookup loop
  - Low: notification writes are batched per team but still done serially inside the invite loop
- Why it's slow: For each created team invitation, the route fetches manager records and then emits notification rows. When the invite list is large, the route becomes serial in a way that multiplies the number of DB calls with team count.
- Estimated impact: O(teamCount) additional reads and writes, which is manageable at small scale but becomes expensive on bulk admin invitations.

### src/app/modules/campRegistration/campRegistration.service.ts:244-263

- Query: `prisma.campPlayer.findUnique({ where: { id: playerId }, include: { campRegistration: { include: { players: true } } } })` and then `prisma.scheduleSession.findMany({ where: { id: { in: toSessionIds } }, include: { scheduleWeek: { select: { schedulePeriodId: true } } } })`
- Triggered by: admin move-player action `movePlayer()`
- Issue(s):
  - High: no composite index on the array membership query for camp registration/session movement
  - Medium: large includes on the target session payload and registration player list
- Why it's slow: The route first loads a camp player record and then loads the target sessions by array membership. The array query is on `scheduleSessionIds` in registrations and `session.id` in the target set, but the camp schema does not have a compound index to support the common `has`/`in` pattern with status or period data.
- Estimated impact: this is a medium-scale path, not the main bottleneck, but it becomes noticeably slow if many session moves occur in admin operations.

### src/app/modules/campRegistration/campRegistration.service.ts:121-154

- Query: `prisma.scheduleSession.findMany({ where: { id: { in: scheduleSessionIds } } })` and `prisma.campRegistration.findMany({ ... include: { players: true }})`
- Triggered by: `registerPlayer()` and `getParticipants()` admin list
- Issue(s):
  - High: the registration list is cached but still includes full nested player arrays; the query is not projection-limited for list screens
  - Medium: these are not pathologically slow in isolation, but repeated on large camp data they contribute to heavier object graphs than needed
- Why it's slow: List screens fetch all player rows for each registration. With a large camp registration count, this amplifies the data size without matching the UI's true need.
- Estimated impact: moderate; the problem is more about payload bloat than the actual query geometry.

### src/app/modules/tournament/tournament.service.ts:128-260

- Query: `prisma.tournament.findMany({ skip, take, where: whereConditions, include: { tournamentDivisions: true }, orderBy: { startDate: "asc" } })` with nested `teaminvitations` queries under `whereConditions` in the non-admin branch
- Triggered by: `getTournamentList()`
- Issue(s):
  - High: complex OR + nested relation filter for tournament search and invite eligibility
  - Medium: includes all division rows for every tournament result in list view
- Why it's slow: Search and visibility logic combine multiple OR conditions and nested relational checks. This is not a full table scan by itself, but the nested `teaminvitations` relation in the filter can be expensive once the tournament and invitation tables get large. The app seems to do this in a general list view with `include` of all divisions.
- Estimated impact: moderate at medium volume, but it becomes a hot path when admin lists or public tournament listings are used frequently.

---

## Medium

### src/app/modules/schedule/schedule.service.ts:300-340

- Query: `prisma.campRegistration.count({ where: { scheduleSessionIds: { has: session.id }, status: "CONFIRMED" } })`
- Triggered by: `updateWeekCapacity()` admin flow
- Issue(s):
  - Medium: missing composite index for `scheduleSessionIds + status`
  - Low: this query is not in a loop and only runs per session update, but it can become expensive on large camp data
- Why it's slow: MongoDB array membership checks on `scheduleSessionIds` are more expensive than a simple scalar lookup. Without a compound index that includes the session membership plus registration status, the count has to inspect more rows.
- Estimated impact: limited per-request impact, but a repeat admin action on large camp populations can be noticeable.

### src/app/modules/teaminvitation/teaminvitation.service.ts:254-316

- Query: `prisma.teaminvitation.findMany({ skip, take, where: whereConditions, include: { toTournament: { select: ... }, toDivision: { select: ... }, invitedTeams: { include: { team: true } } }, orderBy: { createdAt: "desc" } })`
- Triggered by: `getTeaminvitationList()` admin listing
- Issue(s):
  - Medium: broad include of `invitedTeams` and nested `team` data for list pages
  - Low: order-by on createdAt is fine, but the filter conditions are dynamic and the queryset can grow large
- Why it's slow: The list endpoint includes all invited teams and team data, which is a large payload for a collection that can grow with multiple seasons. This is a classic over-fetching issue in list views.
- Estimated impact: moderate on large invite tables, especially when a full page is loaded repeatedly.

---

## Low

### src/shared/cron.ts:16-35 and 48-67

- Query: `prisma.user.findMany({ where: { lastLoginAt: { lt: threeMonthsAgo }, status: "ACTIVE" }, select: { id: true } })` and `prisma.user.updateMany({ where: { lastLoginAt: { lt: threeMonthsAgo }, status: "ACTIVE" }, data: { status: "INACTIVE" } })`
- Triggered by: cron task `updateUserStatus()`
- Issue(s):
  - Low: the query uses a dated inactivity filter with status equality, which is already partly supported by the existing `@@index([role, status, lastLoginAt])` on User—but the app is using only status and lastLoginAt without role
- Why it's slow: This job may scan a very large user collection on a periodic basis. Safely indexed, but not optimized for the exact filter combination of `status + lastLoginAt` without the `role` component.
- Estimated impact: it is not a high-volume hot path, but it can become expensive on a large user table if it runs on a broad frequency.

---

## Notes on index dead weight

I did not find a clearly dead index in the schema among the high-use tables. Most indexes are being used by a query pattern in this codebase, but several hot paths are missing the compound index that matches the real predicate order. The biggest gap is not a totally unused index; it is the absence of composite indexes for:

- `CampWaitlist`: `status + waitlistType + queuePosition` and `status + offerExpiresAt`
- `Match`: `isPublished + status + scheduledAt` (reordered from current index)
- `CampRegistration` / `CampWaitlist`: `scheduleSessionIds + status` and related array membership patterns
- `Teaminvitation`: `userId + toTournamentId + toTournamentDivisionId + status` for duplicate-check queries

The performance issues above are therefore best described as real query-shape mismatches, not simply a set of unused indexes left behind.
