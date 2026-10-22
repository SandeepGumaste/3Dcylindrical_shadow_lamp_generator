import { getClient } from './db';

export interface RateLimiter {
  hit(email: string): Promise<{ ok: boolean; retryAfterSec: number }>;
}

interface Bucket { _id: string; count: number; expireAt: Date }

/** Fixed-window counter per user, kept in MongoDB so every Cloud Run instance shares it. */
export function createRateLimiter(opts: { limit: number; windowMs: number; uri?: string; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  let indexed: Promise<unknown> | undefined;

  async function bump(id: string, expireAt: Date) {
    const col = (await getClient(opts.uri)).db().collection<Bucket>('rateLimits');
    indexed ??= col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    await indexed;
    return col.findOneAndUpdate({ _id: id }, { $inc: { count: 1 }, $setOnInsert: { expireAt } }, { upsert: true, returnDocument: 'after' });
  }

  return {
    async hit(email) {
      const t = now();
      const start = Math.floor(t / opts.windowMs) * opts.windowMs;
      const id = `${email.toLowerCase()}:${start}`;
      const expireAt = new Date(start + opts.windowMs * 2);
      let doc;
      try {
        doc = await bump(id, expireAt);
      } catch (e) {
        // Two first hits can race on the upsert; the loser retries as a plain increment.
        if ((e as { code?: number }).code !== 11000) throw e;
        doc = await bump(id, expireAt);
      }
      return { ok: (doc?.count ?? 1) <= opts.limit, retryAfterSec: Math.max(1, Math.ceil((start + opts.windowMs - t) / 1000)) };
    },
  };
}
