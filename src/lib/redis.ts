import Redis, { RedisOptions } from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
// Redis Client Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0"),

  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error("Redis: max reconnection attempts reached. Giving up.");
      return null;
    }
    return Math.min(times * 200, 3000);
  },

  connectTimeout: 10_000,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  keepAlive: 10_000,
  commandTimeout: 10_000,
};

// ─── Separate options for BullMQ ───
// BullMQ requirements:
//   maxRetriesPerRequest: null (required)
//   enableReadyCheck: false (required)
//   do not use lazyConnect — BullMQ manages connections itself
export const bullMQRedisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0"),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Client Instance
// ─────────────────────────────────────────────────────────────────────────────

export const redis = new Redis(redisOptions);

export const createRedisClient = () => new Redis(redisOptions);

// Connection lifecycle events
redis.on("connect", () => console.info("Redis: connected"));
redis.on("ready", () => console.info("Redis: ready to accept commands"));
redis.on("error", (err) => console.error(`Redis error: ${err.message}`));
redis.on("close", () => console.warn("Redis: connection closed (will retry)"));
redis.on("reconnecting", () => console.warn("Redis: reconnecting..."));

// 'end' means permanently closed — fired when retryStrategy returns null
// 'close' is a temporary close
redis.on("end", () =>
  console.error("Redis: connection ended permanently — no more retries"),
);

// ─────────────────────────────────────────────────────────────────────────────
// TTL Constants (all values in seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const TTL = {
  SHORT: 60 * 10, //  10 minutes — paginated / filtered list
  MEDIUM: 60 * 30, // 30 minutes — single record by ID
  LONG: 60 * 60 * 6, //  6 hours — rarely-changing data
  DAY: 60 * 60 * 24, // 24 hours — static / config data
  SESSION: 60 * 60,
  TOKEN: 60 * 60 * 24, // 24 hours — JWT blacklist
  AUTH_CHECK: 60 * 5, // 5 minutes — cached auth status lookup
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Version-Based Cache Namespacing
//
// Problem with SCAN-based invalidation:
//   - Multi-round-trip, non-atomic, can leave partial state on crash/network drop.
//   - KEYS/SCAN over large keyspaces is slow and blocks the Redis event loop.
//
// Solution: every cache key embeds a "version" number. Invalidation = INCR the
// version counter (single atomic O(1) op). Old keys become unreachable
// automatically and just expire via their own TTL — nothing to hunt down.
//
// Version key convention:
//   cache:ver:<model>            → bumping this invalidates id + list + my (full wipe)
//   cache:ver:<model>:list       → bumping this invalidates list caches only
//   cache:ver:<model>:my:<uid>   → bumping this invalidates one user's lists only
// ─────────────────────────────────────────────────────────────────────────────

const VersionKeys = {
  model: (model: string) => `cache:ver:${model}`,
  list: (model: string) => `cache:ver:${model}:list`,
  myList: (model: string, userId: string) => `cache:ver:${model}:my:${userId}`,
};

// Local in-process cache for version numbers so every cache-key build doesn't
// need a fresh Redis round trip. Short TTL keeps it fresh across instances.
const LOCAL_VERSION_TTL_MS = 2_000;
const versionCache = new Map<string, { value: number; expiresAt: number }>();

async function getVersion(verKey: string): Promise<number> {
  const cached = versionCache.get(verKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const raw = await redis.get(verKey);
    const value = raw ? parseInt(raw, 10) : 0;
    versionCache.set(verKey, { value, expiresAt: now + LOCAL_VERSION_TTL_MS });
    return value;
  } catch (err: any) {
    console.error(
      `Redis GET failed for version key "${verKey}": ${err.message}`,
    );
    // Redis unreachable — fall back to last known version instead of throwing,
    // so reads/writes can still proceed with a (slightly) stale namespace.
    return cached?.value ?? 0;
  }
}

async function bumpVersion(verKey: string): Promise<void> {
  try {
    const newValue = await redis.incr(verKey);
    versionCache.set(verKey, {
      value: newValue,
      expiresAt: Date.now() + LOCAL_VERSION_TTL_MS,
    });
  } catch (err: any) {
    console.error(
      `Redis INCR failed for version key "${verKey}": ${err.message}`,
    );
    // Drop local cache so the next read is forced to re-check Redis rather
    // than keep serving a version we can no longer confirm is current.
    versionCache.delete(verKey);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Key Builders (version-aware, async)
//
// Convention:
//   <model>:v<mv>:id:<id>                        → single record
//   <model>:v<mv>:list:v<lv>:<hash>               → paginated / filtered list
//   <model>:v<mv>:my:<userId>:v<uv>:<hash>        → user-scoped list
// ─────────────────────────────────────────────────────────────────────────────

export const CacheKeys = {
  single: async (model: string, id: string): Promise<string> => {
    const mv = await getVersion(VersionKeys.model(model));
    return `${model}:v${mv}:id:${id}`;
  },

  list: async (
    model: string,
    params: Record<string, unknown>,
  ): Promise<string> => {
    const [mv, lv] = await Promise.all([
      getVersion(VersionKeys.model(model)),
      getVersion(VersionKeys.list(model)),
    ]);
    return `${model}:v${mv}:list:v${lv}:${stableHash(params)}`;
  },

  myList: async (
    model: string,
    userId: string,
    params: Record<string, unknown>,
  ): Promise<string> => {
    const [mv, uv] = await Promise.all([
      getVersion(VersionKeys.model(model)),
      getVersion(VersionKeys.myList(model, userId)),
    ]);
    return `${model}:v${mv}:my:${userId}:v${uv}:${stableHash(params)}`;
  },

  // JWT blacklist — unaffected, no versioning needed (keyed by exact token)
  blacklist: (token: string) => `blacklist:${token}`,
  // Per-user "revoked since" marker for admin block/delete (no token string in scope)
  userRevocation: (userId: string) => `blacklist:user:${userId}`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache Stampede Protection
//
// Problem: If many users simultaneously miss the same cache key,
// you can end up issuing many identical DB queries ("thundering herd").
//
// Solution: store the first fetch's Promise in a Map so concurrent
// requests attach to the same Promise and only one DB query is issued.
// ─────────────────────────────────────────────────────────────────────────────

const pendingFetches = new Map<string, Promise<unknown>>();

// ─────────────────────────────────────────────────────────────────────────────
// cacheOr — Read-Through Cache (Optimized & Protected)
//
// Updated Flow:
//   1. Is the key in Redis? → YES: check if it's a negative cache placeholder.
//                            → If placeholder, return null instantly (Penetration Protected).
//                            → Else, parse and return data.
//   2.                      → NO: is someone else fetching this key?
//   3.                      → YES: attach to their Promise (Stampede Protected).
//   4.                      → NO: start a new DB query.
//   5. When DB data arrives:
//      - If data is valid: add a random Jitter to TTL and save to Redis (Avalanche Protected).
//      - If data is null/undefined: save a placeholder with a short TTL (Penetration Protected).
//
// Note: caller must resolve the key via `await CacheKeys.xxx(...)` first,
// since key building is now async (it needs the current version numbers).
// ─────────────────────────────────────────────────────────────────────────────

export async function cacheOr<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  // Try retrieving data from cache and safely bypass on failure
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      const parsed = JSON.parse(cached);

      // Cache Penetration Shield: Fast-return null if negative marker exists
      if (parsed && parsed.__isNegativeCache === true) {
        return null;
      }

      return parsed as T;
    }
  } catch (err: any) {
    console.error(`Redis GET failed for "${key}": ${err.message}`);
  }

  // Cache Stampede Protection: Consolidate concurrent requests into an existing active promise
  const existing = pendingFetches.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  // Execute database query and map tracking to prevent resource exhaustion
  const fetchPromise = (async () => fetcher())() as Promise<T>;
  pendingFetches.set(key, fetchPromise);

  fetchPromise.finally(() => {
    pendingFetches.delete(key);
  });

  // Background Cache Resolution: Sync fresh data with system security optimizations
  fetchPromise
    .then((fresh) => {
      // Cache Penetration Protection: Lock missing keys for 30s using negative caching
      if (fresh === undefined || fresh === null) {
        const negativeTTL = 30;
        redis
          .set(
            key,
            JSON.stringify({ __isNegativeCache: true }),
            "EX",
            negativeTTL,
          )
          .catch((err) =>
            console.error(
              `Redis Negative SET failed for "${key}": ${err.message}`,
            ),
          );
        return;
      }

      // Cache Avalanche Protection: Append a random jitter (0-30s) to scatter bulk expiration spikes
      const jitter = Math.floor(Math.random() * 30);
      const finalTTL = ttl + jitter;

      redis
        .set(key, JSON.stringify(fresh), "EX", finalTTL)
        .catch((err) =>
          console.error(`Redis SET failed for "${key}": ${err.message}`),
        );
    })
    .catch(() => {
      // Avoid modifying cache state on underlying database failure
    });

  return fetchPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invalidation Helpers (version-based — no SCAN, no pattern DEL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete specific exact keys (still useful — e.g. blacklist tokens,
 * or a single record's current versioned key).
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  // Chunk to avoid Redis max argument limit (~10K) in bulk scenarios
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    await redis
      .del(...chunk)
      .catch((err) => console.error(`Redis DEL failed: ${err.message}`));
  }
}

/**
 * Invalidate a specific record's cache + all list caches for the model.
 * DEL is precise (exact key, current version) — no pattern matching needed.
 * Bumping the list version is an O(1) atomic op — old list keys just expire.
 */
export async function invalidateRecord(
  model: string,
  id: string,
): Promise<void> {
  const singleKey = await CacheKeys.single(model, id);
  await Promise.all([
    invalidateKeys(singleKey),
    bumpVersion(VersionKeys.list(model)),
  ]);
}

/**
 * Invalidate only list caches; single-record caches stay valid.
 */
export async function invalidateModelLists(model: string): Promise<void> {
  await bumpVersion(VersionKeys.list(model));
}

/**
 * Full wipe for a model — id + list + every user's my-list, all in one
 * atomic INCR (the model version is embedded in every key type).
 */
export async function invalidateModel(model: string): Promise<void> {
  await bumpVersion(VersionKeys.model(model));
}

/**
 * Bump myList version for multiple users at once (e.g. clinic + driver + organizer
 * all need their personal list cache invalidated when one record affects all three).
 */
export async function invalidateOwnedLists(
  model: string,
  userIds: (string | null | undefined)[],
): Promise<void> {
  const validIds = [
    ...new Set(userIds.filter((id): id is string => Boolean(id))),
  ];
  await Promise.all(
    validIds.map((id) => bumpVersion(VersionKeys.myList(model, id))),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CacheInvalidator
//
// Import and use these helpers from services. Method names are intentional
// and describe the exact invalidation behavior.
// ─────────────────────────────────────────────────────────────────────────────

export const CacheInvalidator = {
  /** Update / toggle — invalidate record + all lists. Use when userId unknown. */
  onRecordUpdate: (model: string, id: string) => invalidateRecord(model, id),

  /** Update / toggle — invalidate record + all lists + owner's personal lists. */
  onOwnedRecordUpdate: (model: string, id: string, userId: string) =>
    Promise.all([
      invalidateRecord(model, id),
      bumpVersion(VersionKeys.myList(model, userId)),
    ]),

  /**
   * Create — invalidate only list caches (not single-record caches).
   * Avoids a full model wipe / thundering herd. Lists recover on their own TTL.
   */
  /**
   * Create — invalidate list caches + any affected users' personal (myList) caches.
   * Pass a single userId, an array of userIds, or omit if there's no owner concept.
   */
  onRecordCreate: (
    model: string,
    userIds?: string | (string | null | undefined)[],
  ) => {
    const ids = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
    return Promise.all([
      invalidateModelLists(model),
      invalidateOwnedLists(model, ids),
    ]);
  },

  /** Delete (soft or hard) — invalidate record, lists, and owner's personal lists. */
  onRecordDelete: (model: string, id: string, userId?: string) =>
    Promise.all([
      invalidateRecord(model, id),
      ...(userId ? [bumpVersion(VersionKeys.myList(model, userId))] : []),
    ]),

  /** A related model changed and affects list views only. */
  onRelatedChange: (dependentModel: string) =>
    invalidateModelLists(dependentModel),

  /** A related model changed and affects detail pages too — full wipe. */
  onRelatedChangeFull: (dependentModel: string) =>
    invalidateModel(dependentModel),

  /** Full wipe for multiple models. */
  many: (...models: string[]) =>
    Promise.all(models.map((m) => invalidateModel(m))),

  /** List-only wipe for multiple models. */
  manyLists: (...models: string[]) =>
    Promise.all(models.map((m) => invalidateModelLists(m))),
};

// ─────────────────────────────────────────────────────────────────────────────
// Global Cache Flush (admin-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete every versioned data-cache key (prefix `cache:*`) and reset the
 * in-process version cache.
 *
 * Scope is intentionally limited to the model/data cache — OTPs, pending
 * registrations, the auth token cache (`auth:*`), the JWT blacklist
 * (`blacklist:*`) and online-user profiles (`ws:*`) are preserved.
 *
 * Deleting the `cache:ver:*` version keys resets every version counter to 0,
 * so any key built concurrently (with a stale version) simply never matches
 * the new `v0` namespace and expires on its own TTL.
 */
export async function invalidateAllCache(): Promise<number> {
  const stream = redis.scanStream({ match: "cache:*", count: 1000 });
  const keys: string[] = [];

  return new Promise<number>((resolve, reject) => {
    stream.on("data", (batch: string[]) => {
      if (batch.length) keys.push(...batch);
    });

    stream.on("error", (err) => {
      console.error(`Redis SCAN failed during cache flush: ${err.message}`);
      reject(err);
    });

    stream.on("end", async () => {
      try {
        const CHUNK_SIZE = 1000;
        let deleted = 0;
        for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
          const chunk = keys.slice(i, i + CHUNK_SIZE);
          if (chunk.length) {
            deleted += await redis.del(...chunk);
          }
        }
        // Drop in-process version cache so no stale version number is reused.
        versionCache.clear();
        console.info(`Redis cache flushed: ${deleted} keys deleted`);
        resolve(deleted);
      } catch (err: any) {
        console.error(`Redis cache flush failed: ${err.message}`);
        reject(err);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Blacklist (JWT logout / invalidation)
// ─────────────────────────────────────────────────────────────────────────────

export const blacklistToken = async (
  token: string,
  ttlSeconds: number,
): Promise<void> => {
  await redis.set(CacheKeys.blacklist(token), "1", "EX", ttlSeconds);
};

export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const result = await redis.get(CacheKeys.blacklist(token));
  return result !== null;
};

// Per-user "revoked since" marker. Admin block/delete flows only know the target
// userId (not its JWT), so the exact-token blacklist can't be used there. auth/
// optionalAuth compare the token's `iat` against this timestamp: tokens issued
// before revocation are rejected; tokens issued after unblock/restore still work.
// TTL must outlive the longest-lived token (EXPIRES_IN=60d), hence 70 days.
export const blacklistUserTokens = async (
  userId: string,
  ttlSeconds: number = TTL.DAY * 70,
): Promise<void> => {
  await redis.set(
    CacheKeys.userRevocation(userId),
    String(Date.now()),
    "EX",
    ttlSeconds,
  );
};

export const getUserTokenRevokedAt = async (
  userId: string,
): Promise<number | null> => {
  const result = await redis.get(CacheKeys.userRevocation(userId));
  return result ? Number(result) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Disconnect
// ─────────────────────────────────────────────────────────────────────────────

export async function disconnectRedis(): Promise<void> {
  try {
    console.info("Redis: shutting down gracefully...");

    await Promise.race([
      redis.quit(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis quit timed out after 5s")),
          5_000,
        ),
      ),
    ]);

    console.info("Redis: disconnected gracefully");
  } catch (err: any) {
    console.error(
      `Redis graceful quit failed: ${err.message} — forcing disconnect`,
    );
    redis.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Stable Hash
//
// params object → deterministic short string

// Why sort keys:
//   { page:1, limit:20 } and { limit:20, page:1 } → same hash
//   Different key order should yield the same cache key

// Why drop empty/null values:
//   { page:1, searchTerm:'' } = { page:1 } — same query
//   Keeping empty values would create unnecessary cache slots

// Why not sort arrays:
//   primitive arrays like ['active','pending'] can be sorted safely
//   object arrays (e.g. [{id:2},{id:1}]) sorting is unpredictable
//   JSON.stringify() provides a consistent output — extra sorting isn't needed
// ─────────────────────────────────────────────────────────────────────────────

function stableHash(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== "") {
        acc[k] = v;
      }
      return acc;
    }, {});

  // djb2 variant hash algorithm
  // simple, fast, collision-resistant enough for cache keys
  const str = JSON.stringify(sorted);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash |= 0; // force to 32-bit integer
  }

  // unsigned 32-bit → base-36 string (0-9 + a-z, small and readable)
  return (hash >>> 0).toString(36);
}

export default redis;
