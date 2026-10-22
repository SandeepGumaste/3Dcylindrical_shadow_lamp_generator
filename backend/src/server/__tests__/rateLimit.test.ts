import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { createRateLimiter } from '../rateLimit';

const URI = 'mongodb://127.0.0.1:27017/odd-shadows-test-ratelimit';
let client: MongoClient;

beforeEach(async () => {
  client ??= await new MongoClient(URI).connect();
  await client.db().collection('rateLimits').deleteMany({});
});
afterAll(async () => {
  await client?.db().collection('rateLimits').drop().catch(() => {});
  await client?.close();
});

describe('createRateLimiter', () => {
  it('allows `limit` hits per window, then refuses with a positive retryAfterSec', async () => {
    const l = createRateLimiter({ limit: 3, windowMs: 60_000, uri: URI, now: () => 1_000_000 });
    for (let i = 0; i < 3; i++) expect((await l.hit('a@x.com')).ok).toBe(true);
    const over = await l.hit('a@x.com');
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
  });
  it('counts users separately and ignores email case', async () => {
    const l = createRateLimiter({ limit: 1, windowMs: 60_000, uri: URI, now: () => 1_000_000 });
    expect((await l.hit('A@x.com')).ok).toBe(true);
    expect((await l.hit('a@x.com')).ok).toBe(false);
    expect((await l.hit('b@x.com')).ok).toBe(true);
  });
  it('lets exactly `limit` of 20 concurrent hits through', async () => {
    const l = createRateLimiter({ limit: 5, windowMs: 60_000, uri: URI, now: () => 1_000_000 });
    const results = await Promise.all(Array.from({ length: 20 }, () => l.hit('c@x.com')));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });
  it('allows again once the window has passed', async () => {
    let t = 1_000_000;
    const l = createRateLimiter({ limit: 1, windowMs: 60_000, uri: URI, now: () => t });
    expect((await l.hit('d@x.com')).ok).toBe(true);
    expect((await l.hit('d@x.com')).ok).toBe(false);
    t += 61_000;
    expect((await l.hit('d@x.com')).ok).toBe(true);
  });
});
