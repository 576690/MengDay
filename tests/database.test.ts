import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { initialData, uid, toggleTimer } from '../src/model';
const db = new PGlite();
const alice = uid(),
  bob = uid(),
  forced = uid();
async function asUser(id: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
  );
}
async function commit(op: string, rev: number, data: unknown) {
  const r = await db.query<{ result: { conflict: boolean; revision: number; data: unknown } }>(
    'select public.commit_state($1::uuid,$2::bigint,$3::jsonb) as result',
    [op, rev, JSON.stringify(data)],
  );
  return r.rows[0].result;
}
beforeAll(async () => {
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key,encrypted_password text,raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'app_metadata',coalesce((select raw_app_meta_data from auth.users where id=auth.uid()),'{}'::jsonb))$$;grant usage on schema auth to authenticated;grant select on auth.users to authenticated;`,
  );
  await db.exec(
    readFileSync('supabase/migrations/001_mengday.sql', 'utf8').replace(
      'alter publication supabase_realtime add table public.user_states;',
      '',
    ),
  );
  await db.query(
    "insert into auth.users(id,encrypted_password,raw_app_meta_data) values($1,'old','{}'),($2,'old','{}'),($3,'old','{\"force_password_change\":true}')",
    [alice, bob, forced],
  );
}, 60000);
afterAll(() => db.close());
describe.sequential('real PostgreSQL migration and policies', () => {
  it('commits atomically and acknowledges retries exactly once', async () => {
    await asUser(alice);
    const d = initialData(),
      op = uid();
    toggleTimer(d, '工作', 1000, '私密备注');
    expect(await commit(op, 0, d)).toMatchObject({ conflict: false, revision: 1 });
    expect(await commit(op, 0, d)).toMatchObject({ conflict: false, revision: 1 });
    const row = await db.query<{ revision: number }>('select revision from user_states');
    expect(row.rows[0].revision).toBe(1);
  });
  it('returns conflicts instead of overwriting other device changes', async () => {
    await asUser(alice);
    const stale = initialData();
    expect(await commit(uid(), 0, stale)).toMatchObject({ conflict: true, revision: 1 });
  });
  it('isolates users and rejects direct table writes', async () => {
    await asUser(bob);
    expect((await db.query('select * from user_states')).rows).toHaveLength(0);
    await expect(db.query('update user_states set revision=100')).rejects.toThrow(/permission/i);
    await expect(db.query('select * from sync_operations')).rejects.toThrow(/permission/i);
    expect(await commit(uid(), 0, initialData())).toMatchObject({ revision: 1 });
    expect((await db.query('select * from user_states')).rows).toHaveLength(1);
  });
  it('rejects overlapping or invalid data on the server', async () => {
    await asUser(bob);
    const d = initialData();
    d.entries = [
      { id: uid(), activityId: d.activities[0].id, start: 1000, end: 3000, note: '' },
      { id: uid(), activityId: d.activities[1].id, start: 2000, end: 4000, note: '' },
    ];
    await expect(commit(uid(), 1, d)).rejects.toThrow(/Overlapping/);
    d.entries[1].start = 3000;
    expect(await commit(uid(), 1, d)).toMatchObject({ revision: 2 });
  });
  it('requires temporary password change and clears flag on actual password change', async () => {
    await asUser(forced);
    await expect(commit(uid(), 0, initialData())).rejects.toThrow(/Change temporary password/);
    await db.exec('reset role');
    await db.query("update auth.users set encrypted_password='new-hash' where id=$1", [forced]);
    await asUser(forced);
    expect(await commit(uid(), 0, initialData())).toMatchObject({ revision: 1 });
  });
  it('rejects unauthenticated RPC calls', async () => {
    await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
    await expect(commit(uid(), 0, initialData())).rejects.toThrow(/permission/i);
  });
});
