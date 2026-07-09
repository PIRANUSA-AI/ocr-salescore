import Redis from 'ioredis';
import { config } from '../config.js';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;

  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    keyPrefix: config.redis.keyPrefix,
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

  client.on('error', (e) => console.error('[redis] error:', e.message));
  return client;
}

export async function cacheGet<T>(
  key: string,
  loader: () => Promise<T>,
  ttl = 30,
): Promise<T> {
  try {
    const hit = await getRedis().get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* fall through */ }

  const fresh = await loader();
  try {
    await getRedis().set(key, JSON.stringify(fresh), 'EX', ttl);
  } catch { /* ignore */ }
  return fresh;
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await getRedis().del(...keys);
  } catch { /* ignore */ }
}
