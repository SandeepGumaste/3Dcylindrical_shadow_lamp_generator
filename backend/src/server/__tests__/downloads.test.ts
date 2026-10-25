import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { createMongoDownloadRecorder } from '../downloads';
import { createMongoUserStore } from '../users';

const URI = 'mongodb://127.0.0.1:27017/odd-shadows-downloads-test';
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

describe('createMongoDownloadRecorder', () => {
  it('counts each download on the user record, in total and per mode', async () => {
    await createMongoUserStore(URI).upsert({ email: 'me@x.com', name: 'Me', image: '', role: 'user' });
    const record = createMongoDownloadRecorder(URI);
    await record('Me@X.com', 'tealight');
    await record('me@x.com', 'tealight');
    await record('me@x.com', 'box');

    const docs = await client.db().collection('users').find().toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].downloadCount).toBe(3);
    expect(docs[0].downloadsByMode).toEqual({ tealight: 2, box: 1 });
    expect(docs[0].lastDownloadAt).toBeInstanceOf(Date);
    expect(docs[0].name).toBe('Me');
  });
});
