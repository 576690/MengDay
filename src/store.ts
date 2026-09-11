import { openDB } from 'idb';
import { createClient } from '@supabase/supabase-js';
import { initialData, uid, validateData, type Data } from './model';
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key && !url.includes('YOUR_PROJECT') ? createClient(url, key) : null;
type Snapshot = { revision: number; data: Data };
export type Envelope = {
  data: Data;
  revision: number;
  pending: boolean;
  operationId: string;
  conflict?: Snapshot;
};
const db = openDB('mengday-v1', 1, {
  upgrade(db) {
    db.createObjectStore('accounts');
  },
});
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mengday-updates') : null;
export const readCache = async (user: string): Promise<Envelope | undefined> =>
  (await db).get('accounts', user);
const writeCache = async (user: string, value: Envelope) => {
  await (await db).put('accounts', value, user);
  channel?.postMessage(user);
};
export const clearCache = async (user: string) => {
  await (await db).delete('accounts', user);
  channel?.postMessage(user);
};
export class Store {
  value: Envelope | null = null;
  status = '正在读取';
  error = '';
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(
    public user: string,
    public local = false,
  ) {
    channel?.addEventListener('message', this.onMessage);
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
  }
  private onMessage = (e: MessageEvent) => {
    if (e.data === this.user) void this.reload();
  };
  private onOnline = () => void this.sync();
  private onVisible = () => {
    if (!document.hidden) void this.sync();
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    if (!this.disposed) this.listeners.forEach((f) => f());
  }
  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    if (!navigator.locks) throw Error('请使用支持安全本地存储的新版浏览器');
    return navigator.locks.request(`mengday:${this.user}`, fn);
  }
  async init() {
    await this.locked(async () => {
      if (this.disposed) return;
      let v = await readCache(this.user);
      if (!v && this.local) {
        v = { data: initialData(), revision: 0, pending: false, operationId: uid() };
        await writeCache(this.user, v);
      }
      this.value = v ?? null;
    });
    await this.sync();
  }
  async reload() {
    this.value = (await readCache(this.user)) ?? null;
    this.emit();
  }
  async mutate(change: (data: Data) => void) {
    await this.locked(async () => {
      if (this.disposed) throw Error('账号已关闭，请重新登录');
      const v = await readCache(this.user);
      if (!v) throw Error('请先联网加载账号数据');
      const data = structuredClone(v.data);
      change(data);
      validateData(data);
      this.value = { ...v, data, pending: !this.local, operationId: uid() };
      await writeCache(this.user, this.value);
      this.status = this.local ? '本机保存' : '待同步';
      this.emit();
    });
    void this.sync();
  }
  async sync() {
    if (this.disposed) return;
    if (this.local) {
      this.status = '本机保存';
      this.emit();
      return;
    }
    if (!supabase) return;
    await this.locked(async () => {
      if (this.disposed) return;
      let v = await readCache(this.user);
      this.value = v ?? null;
      if (!navigator.onLine) {
        this.status = '离线 · 待联网';
        this.emit();
        return;
      }
      if (v?.conflict) {
        this.status = '需要处理冲突';
        this.emit();
        return;
      }
      this.status = '正在同步';
      this.emit();
      try {
        if (v?.pending) {
          const { data, error } = await supabase!.rpc('commit_state', {
            p_operation_id: v.operationId,
            p_expected_revision: v.revision,
            p_data: v.data,
          });
          if (error) throw error;
          if (data.conflict) {
            v = { ...v, conflict: { revision: data.revision, data: data.data } };
            this.status = '需要处理冲突';
          } else {
            v = { ...v, revision: data.revision, pending: false };
            this.status = '已同步';
          }
          await writeCache(this.user, v);
        } else {
          const { data, error } = await supabase!
            .from('user_states')
            .select('revision,data')
            .eq('user_id', this.user)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            validateData(data.data);
            v = { data: data.data, revision: data.revision, pending: false, operationId: uid() };
          } else if (!v) {
            const init = initialData(),
              op = uid();
            const { data: r, error: e } = await supabase!.rpc('commit_state', {
              p_operation_id: op,
              p_expected_revision: 0,
              p_data: init,
            });
            if (e) throw e;
            v = {
              data: r.conflict ? r.data : init,
              revision: r.revision,
              pending: false,
              operationId: uid(),
            };
          }
          if (v) await writeCache(this.user, v);
          this.status = '已同步';
        }
        this.error = '';
        this.value = v ?? null;
      } catch (e) {
        this.error =
          e instanceof Error ? e.message : ((e as { message?: string })?.message ?? '连接失败');
        this.status = '同步失败 · 点击重试';
      }
      this.emit();
    });
  }
  async resolve(data: Data) {
    validateData(data);
    await this.locked(async () => {
      const v = await readCache(this.user);
      if (!v?.conflict) throw Error('冲突状态已改变，请重试');
      this.value = { data, revision: v.conflict.revision, pending: true, operationId: uid() };
      await writeCache(this.user, this.value);
      this.emit();
    });
    await this.sync();
  }
  dispose() {
    this.disposed = true;
    channel?.removeEventListener('message', this.onMessage);
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.listeners.clear();
  }
  async closeAndClear() {
    this.dispose();
    await this.locked(() => clearCache(this.user));
  }
}
