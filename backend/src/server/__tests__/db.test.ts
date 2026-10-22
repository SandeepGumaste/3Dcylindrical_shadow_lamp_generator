import { describe, expect, it } from 'vitest';
import { getClient } from '../db';

describe('getClient', () => {
  it('gives up within 9s when mongo is unreachable (under the 10s function limit)', async () => {
    await expect(getClient('mongodb://127.0.0.1:1/x')).rejects.toThrow();
  }, 9000);
});
