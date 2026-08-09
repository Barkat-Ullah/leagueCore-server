# AGENTS.md

Express 4 + TypeScript API for LeagueCore (soccer tournament/camp management). Prisma over MongoDB, Redis-backed caching + BullMQ queues, node-cron.

## Commands

- `npm run dev` — run API from source (ts-node-dev, `--transpile-only`, **no type checking**)
- `npm run build` — `tsc` → `dist/`. This is the only real verification: there is **no lint and no typecheck script**
- `npm run start` — `node dist/server.js`
- `npm run worker` — `node dist/worker.js` (BullMQ worker; **must be running separately** for queued emails)
- `npm test` — stub that exits 1; do not rely on it
- `npm run generate <ModuleName>` — scaffold a new CRUD module from a Prisma model (controller/service/routes/validation) and auto-register it in `src/app/routes/index.ts`
- `npm run generate -- --sync` — **overwrites every module's validation file** to match `schema.prisma`. Run after model changes; never hand-edit generated validation files
- `postinstall` runs `prisma generate`; after editing `prisma/schema.prisma` run `npx prisma generate` (and `npx prisma db push` — no migrations dir exists)

## Architecture

- API entry: `src/server.ts`; worker entry: `src/worker.ts`. Both import from `src/app.ts` / config.
- Module pattern: `src/app/modules/<name>/<name>.{controller,routes,service,validation}.ts`. Modules are registered **manually** in `src/app/routes/index.ts` at a pluralized path (`/api/v1/<plural>`); the generator patches it, but keep it in sync when editing routes.
- Quirk names (typos are intentional and must be preserved): auth module lives in `src/app/modules/autth/`; helpers in `src/helpars/`; user module uses `user.route.ts`/`user.services.ts` (plural).
- Data layer: Prisma client `@prisma/client`. All IDs are MongoDB `@db.ObjectId` strings; `@@map` renames collections (many PascalCase, e.g. `Teamregistration` → `teamRegistration`, `TournamentDivisions`). Always use Prisma model names, not collection names.
- Validation: zod schemas are auto-generated, `.strict()`, and skip `id`/`createdAt`/`updatedAt`/`userId`/`createdBy` (server-set). `validateRequest` middleware also JSON-parses `req.body.data` for multipart payloads.
- Auth: `auth()` middleware (JWT from cookie) protects routes; `optionalAuth`/`access` also exist. Stripes webhook route `/api/v1/webhooks` uses `express.raw()` and must stay registered **before** `express.json()` in `src/app.ts`.

## Redis, queues, cron (hard dependencies)

- Redis is required at startup (`src/lib/redis.ts`): `cacheOr` read-through cache + `CacheInvalidator` helpers. After any write in a service, invalidate via `CacheInvalidator.onRecordCreate/onRecordUpdate/onRecordDelete(model, ...)` — skipping this leaves stale caches. Cache keys are version-namespaced; do not `DEL` patterns.
- Queues (`src/lib/queue/queues.ts`): `emailQueue`, `notificationQueue`, `waiverAlertQueue` (BullMQ). Enqueue work rather than sending synchronously.
- Crons run **inside the API process** (`src/shared/cron.ts`, started by `server.ts`), not the worker. `seedSeries()` also runs at startup (non-fatal on error).

## Env & deploy

- Config loads `.env` from repo root (`src/config/index.ts`). Required vars include: `DATABASE_URL` (MongoDB), `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDIS_HOST/PORT/PASSWORD`, `CLOUDINARY_*`, `DO_SPACE_*`, `EMAIL`/`APP_PASS` (nodemailer app password). `.env` is gitignored; never commit secrets.
- Uploads: `src/helpars/fileUploader.ts` — DigitalOcean Spaces (S3 SDK) + Cloudinary; `uploadSingle` expects field name `image`.
- Deploy: `vercel.json` serves `dist/server.js`; `ecosystem.config.js` runs PM2 apps `leaguecore-api` and `leaguecore-worker` — both need `npm run build` first.
- `PERFORMANCE_AUDIT.md`/`PERFORMANCE_PLAN.md` describe the current caching/performance work (Redis cache layer already implemented).
