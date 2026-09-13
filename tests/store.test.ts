import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { initialData, toggleTimer, type Data } from '../src/model';
const server = vi.hoisted(() => ({
  revision: 0,
  data: null as Data | null,
  ops: new Map<string, number>(),
  fail: false,
  loseReply: false,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (
      _name: string,
      p: { p_operation_id: string; p_expected_revision: number; p_data: Data },
    ) => {
      if (server.fail) return { error: { message: 'offline' }, data: null };
      if (server.ops.has(p.p_operation_id))
        return {
          error: null,
          data: { conflict: false, revision: server.ops.get(p.p_operation_id) },
        };
      if (p.p_expected_revision !== server.revision)
        return {
          error: null,
          data: { conflict: true, revision: server.revision, data: structuredClone(server.data) },
        };
      server.revision++;
      server.data = structuredClone(p.p_data);
      server.ops.set(p.p_operation_id, server.revision);
      if (server.loseReply) {
        server.loseReply = false;
        return { error: { message: 'reply lost' }, data: null };
      }
      return { error: null, data: { conflict: false, revision: server.revision } };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            server.fail
              ? { error: { message: 'offline' }, data: null }
              : {
                  error: null,
                  data: server.data
                    ? { revision: server.revision, data: structuredClone(server.data) }
                    : null,
                },
        }),
      }),
    }),
  }),
}));
let Store: typeof import('../src/store').Store,
  clearCache: typeof import('../src/store').clearCache;
const instances: InstanceType<typeof Store>[] = [];
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: {
      request: (key: string, fn: () => Promise<unknown>) => {
        const next = (tails.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
        tails.set(key, next);
        return next;
      },
    },
  });
  vi.stubGlobal(
    'BroadcastChannel',
    class extends EventTarget {
      postMessage() {}
    },
  );
  ({ Store, clearCache } = await import('../src/store'));
});
beforeEach(() => {
  server.revision = 0;
  server.data = null;
  server.ops.clear();
  server.fail = false;
  server.loseReply = false;
  navigator.onLine = true;
});
afterAll(async () => {
  instances.forEach((s) => s.dispose());
  await Promise.all(instances.map((s) => clearCache(s.user)));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const make = (id: string, local = false) => {
  const s = new Store(id, local);
  instances.push(s);
  return s;
};
it('persists offline edits and notes, recovers after reopening, then syncs', async () => {
  const s = make('offline');
  await s.init();
  navigator.onLine = false;
  await s.mutate((d) => toggleTimer(d, '写作', 1000, '想法\n细节'));
  await s.sync();
  expect(s.value!.pending).toBe(true);
  s.dispose();
  const reopened = make('offline');
  await reopened.init();
  expect(reopened.value!.data.entries[0].note).toBe('想法\n细节');
  navigator.onLine = true;
  await reopened.sync();
  expect(reopened.value!.pending).toBe(false);
  expect(server.data!.entries[0].note).toBe('想法\n细节');
});
it('retains operation ID after a lost response and retries idempotently', async () => {
  const s = make('retry');
  await s.init();
  navigator.onLine = false;
  await s.mutate((d) => toggleTimer(d, '工作', 1000));
  await s.sync();
  server.loseReply = true;
  navigator.onLine = true;
  await s.sync();
  const op = s.value!.operationId;
  expect(s.value!.pending).toBe(true);
  await s.sync();
  expect(s.value!.operationId).toBe(op);
  expect(server.revision).toBe(2);
  expect(s.value!.pending).toBe(false);
});
it('preserves local and cloud changes until explicit resolution', async () => {
  const s = make('conflict');
  await s.init();
  navigator.onLine = false;
  await s.mutate((d) => toggleTimer(d, '工作', 1000, '本机'));
  server.revision++;
  server.data = initialData();
  toggleTimer(server.data, '学习', 2000, '云端');
  navigator.onLine = true;
  await s.sync();
  expect(s.value!.conflict!.data.entries[0].note).toBe('云端');
  expect(s.value!.data.entries[0].note).toBe('本机');
  await s.resolve(s.value!.conflict!.data);
  expect(s.value!.pending).toBe(false);
  expect(s.value!.data.entries[0].note).toBe('云端');
});
it('isolates local cache by identity and serializes two tabs', async () => {
  const a = make('tabs', true),
    b = make('tabs', true),
    other = make('other', true);
  await Promise.all([a.init(), b.init(), other.init()]);
  await Promise.all([
    a.mutate((d) => toggleTimer(d, '工作', 1000)),
    b.mutate((d) => toggleTimer(d, '学习', 62000)),
  ]);
  await a.reload();
  expect(a.value!.data.entries).toHaveLength(2);
  expect(a.value!.data.entries.filter((e) => e.end === null)).toHaveLength(1);
  expect(other.value!.data.entries).toHaveLength(0);
});
it('clears the account after queued work and rejects late writes on logout', async () => {
  const s = make('logout', true);
  await s.init();
  await s.mutate((d) => toggleTimer(d, '工作', 1000));
  await s.closeAndClear();
  await expect(s.mutate((d) => toggleTimer(d, '学习', 2000))).rejects.toThrow('账号已关闭');
  const { readCache } = await import('../src/store');
  expect(await readCache('logout')).toBeUndefined();
});
