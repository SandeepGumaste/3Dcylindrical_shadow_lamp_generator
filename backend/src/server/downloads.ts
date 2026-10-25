import { getClient } from './db';
import type { UserRecord } from './users';

/** Counts a finished download against the person who made it. */
export type DownloadRecorder = (email: string, mode: string) => Promise<void>;

/**
 * Keeps the numbers on the user's own record: `downloadCount`, `downloadsByMode.<mode>` and `lastDownloadAt`.
 * No file, picture or setting is stored.
 */
export function createMongoDownloadRecorder(uri?: string): DownloadRecorder {
  return async (email, mode) => {
    const users = (await getClient(uri)).db().collection<UserRecord>('users');
    const address = email.toLowerCase();
    await users.updateOne(
      { email: address },
      {
        $inc: { downloadCount: 1, [`downloadsByMode.${mode}`]: 1 },
        $set: { lastDownloadAt: new Date() },
        $setOnInsert: { email: address, createdAt: new Date() },
      },
      { upsert: true },
    );
  };
}
