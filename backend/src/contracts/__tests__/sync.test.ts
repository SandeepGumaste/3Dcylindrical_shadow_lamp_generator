import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('../../../../', import.meta.url).pathname;
const script = join(repo, 'scripts/sync-contracts.mjs');
const run = (root: string) => spawnSync('node', [script, '--check'], { cwd: root, encoding: 'utf8' });

function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  cpSync(join(repo, 'backend/src/contracts'), join(root, 'backend/src/contracts'), { recursive: true });
  cpSync(join(repo, 'frontend/src/contracts'), join(root, 'frontend/src/contracts'), { recursive: true });
  return root;
}

describe('sync-contracts --check', () => {
  it('passes when the frontend copy matches the backend source', () => {
    expect(run(repo).status).toBe(0);
  });
  it('fails and names the file when the copy drifts', () => {
    const root = copyOfRepo();
    const file = join(root, 'frontend/src/contracts/api.ts');
    writeFileSync(file, readFileSync(file, 'utf8') + '// drift\n');
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain('api.ts');
  });
});
