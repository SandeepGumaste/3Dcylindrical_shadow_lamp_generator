import { getClient } from './db';
import type { Role } from './roles';

export interface UserRecord {
  email: string;
  name: string;
  image: string;
  role: Role;
  createdAt: Date;
  /** Finished downloads (any file output, not previews); written by the download recorder. */
  downloadCount?: number;
  downloadsByMode?: Record<string, number>;
  lastDownloadAt?: Date;
}

export interface UserStore {
  upsert(u: { email: string; name: string; image: string; role: Role }): Promise<UserRecord>;
}

export function createMongoUserStore(uri?: string): UserStore {
  let indexed: Promise<unknown> | undefined;
  return {
    async upsert(u) {
      const users = (await getClient(uri)).db().collection<UserRecord>('users');
      indexed ??= users.createIndex({ email: 1 }, { unique: true });
      await indexed;
      const email = u.email.toLowerCase();
      const doc = await users.findOneAndUpdate(
        { email },
        {
          $set: { name: u.name, image: u.image, role: u.role },
          $setOnInsert: { email, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!doc) throw new Error('user upsert returned no document');
      return doc;
    },
  };
}
