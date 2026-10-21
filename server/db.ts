import { MongoClient } from 'mongodb';

export const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/odd-shadows';

const clients = new Map<string, Promise<MongoClient>>();

/** One shared client per URI, created on first use (serverless-friendly). */
export function getClient(uri: string = process.env.MONGODB_URI || DEFAULT_MONGODB_URI): Promise<MongoClient> {
  let client = clients.get(uri);
  if (!client) {
    client = new MongoClient(uri).connect();
    client.catch(() => clients.delete(uri));
    clients.set(uri, client);
  }
  return client;
}
