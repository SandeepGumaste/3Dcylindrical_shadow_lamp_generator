import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('?signin=1 on the app address', () => {
  beforeEach(() => { vi.resetModules(); });
  const load = async (href: string) => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { href }, history: { replaceState } });
    vi.stubGlobal('document', { createElement: () => ({}) });
    const mod = await import('../AuthGate');
    return { mod, replaceState };
  };

  it('is read once and removed from the address', async () => {
    const { replaceState } = await load('https://x.test/app?signin=1&a=2#h');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app?a=2#h');
  });

  it('leaves an address without the flag alone', async () => {
    const { replaceState } = await load('https://x.test/app');
    expect(replaceState).not.toHaveBeenCalled();
  });
});
