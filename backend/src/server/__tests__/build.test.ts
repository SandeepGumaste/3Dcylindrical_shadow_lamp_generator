import { afterAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

const backend = new URL('../../../', import.meta.url).pathname;
let child: ChildProcess | undefined;
afterAll(() => { child?.kill(); });

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  for (;;) {
    try { return await fetch(url); } catch (e) { if (Date.now() > until) throw e; await new Promise((r) => setTimeout(r, 200)); }
  }
}

describe('the production build', () => {
  it('bundles the server with its assets and answers requests', async () => {
    const built = spawnSync('pnpm', ['run', 'build'], { cwd: backend, encoding: 'utf8' });
    expect(built.status, built.stderr).toBe(0);
    expect(existsSync(`${backend}dist/main.js`)).toBe(true);
    expect(existsSync(`${backend}dist/assets/box-kit/tray-2aa.stl`)).toBe(true);

    const port = 41000 + Math.floor(Math.random() * 2000);
    child = spawn('node', ['dist/main.js'], { cwd: backend, env: { ...process.env, PORT: String(port), AUTH_SECRET: 'x', ASSETS_DIR: `${backend}dist/assets` }, stdio: 'ignore' });
    const me = await waitFor(`http://127.0.0.1:${port}/api/me`, 15_000);
    expect(me.status).toBe(401);
    const gen = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', body: '{}' });
    expect(gen.status).toBe(401);
  }, 60_000);
});
