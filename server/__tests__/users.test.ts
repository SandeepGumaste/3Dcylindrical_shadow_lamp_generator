import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { createMongoUserStore } from '../users';

const URI = 'mongodb://127.0.0.1:27017/odd-shadows-test';
let client: MongoClient;

beforeAll(async () => {
  client = new MongoClient(URI);
  await client.connect();
  await client.db().dropDatabase();
});
afterAll(async () => {
  await client.db().dropDatabase();
  await client.close();
});

describe('createMongoUserStore', () => {
  it('keeps one document per email, the original createdAt, and updates role', async () => {
    const store = createMongoUserStore(URI);
    const first = await store.upsert({ email: 'Me@X.com', name: 'Me', image: 'a.png', role: 'user' });
    await new Promise((r) => setTimeout(r, 10));
    const second = await store.upsert({ email: 'me@x.com', name: 'Me 2', image: 'b.png', role: 'admin' });

    const docs = await client.db().collection('users').find().toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].email).toBe('me@x.com');
    expect(second.role).toBe('admin');
    expect(second.name).toBe('Me 2');
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
  });
});
