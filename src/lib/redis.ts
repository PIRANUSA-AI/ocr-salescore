// src/lib/redis.ts
// Redis cache (real, shared instance). All keys namespaced under "salescore:"
// so they never collide with other apps using the same Redis db.
// Purpose: absorb read load from many concurrent sales users at the exhibition
// so task lists don't re-hit MySQL on every request (no queueing / slow loads).
import Redis from 'ioredis';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;
  client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    keyPrefix: 'salescore:',
    // Fail fast + don't crash the app if Redis is briefly unavailable;
    // callers fall back to MySQL on cache miss/error.
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  client.on('error', (e) => console.error('[redis] error:', e.message));
  return client;
}

const DEFAULT_TTL = Number(process.env.REDIS_TTL_SECONDS || 30);

/** Cache-aside read: try Redis, else run loader(), store result, return it. */
export async function cacheGet<T>(
  key: string,
  loader: () => Promise<T>,
  ttl = DEFAULT_TTL
): Promise<T> {
  try {
    const hit = await getRedis().get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // cache down → fall through to loader (still serves users, just uncached)
  }
  const fresh = await loader();
  try {
    await getRedis().set(key, JSON.stringify(fresh), 'EX', ttl);
  } catch {
    /* ignore cache write failure */
  }
  return fresh;
}

/** Invalidate one or more cache keys after a write. */
export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await getRedis().del(...keys);
  } catch {
    /* ignore */
  }
}

export const taskCacheKey = (userId: string) => `tasks:user:${userId}`;
