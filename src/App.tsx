import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Timeline from './Timeline';
import { ActivityMenu, DeleteActivityModal } from './activity-actions';
import { AppearancePicker } from './activity-appearance';
import { palette, type Appearance } from './appearance';
import { applyChange, type Change } from './timeline-model';
import type { User } from '@supabase/supabase-js';
import {
  Play,
  Square,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ChartNoAxesCombined,
  CalendarDays,
  Settings2,
  Cloud,
  CloudOff,
  Check,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  LogOut,
  ArrowUp,
  ArrowDown,
  Archive,
  RotateCcw,
  MoreHorizontal,
  Sparkles,
  Target,
  ShieldCheck,
  WifiOff,
  LoaderCircle,
  X,
  KeyRound,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ActivityIcon,
  Modal,
  NameInput,
  EntryForm,
  ActivityForm,
  Empty,
  DownloadFile,
} from './components';
import { Store, supabase } from './store';
import {
  backup,
  csv,
  parseBackup,
  mergeData,
  ensureActivity,
  toggleTimer,
  categoryTotals,
  manualRange,
  clockText,
  dateKey,
  dayBounds,
  shiftDate,
  shiftMonth,
  rangeDays,
  totals,
  duration,
  human,
  type Data,
  type Entry,
  type Activity,
} from './model';

type Page = 'today' | 'history' | 'stats' | 'settings';
const pages = [
  { id: 'today', label: '今日', icon: Clock3 },
  { id: 'history', label: '记录', icon: CalendarDays },
  { id: 'stats', label: '统计', icon: ChartNoAxesCombined },
  { id: 'settings', label: '设置', icon: Settings2 },
] as const;
function Brand() {
  return (
    <div className="brand">
      <img src="/icon.svg" alt="" />
      <span>
        MengDay<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function PasswordForm({
  forced = false,
  onDone,
  onClose,
}: {
  forced?: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={forced ? '设置你的专属密码' : '修改密码'}
      description={
        forced
          ? '首次登录，请将临时密码换成只有你知道的密码。'
          : '忘记密码时，可联系账号管理员重置。'
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) {
            setError('两次输入的密码不一致');
            return;
          }
          setBusy(true);
          try {
            const { error } = await supabase!.auth.updateUser({ password });
            if (error) throw error;
            await supabase!.auth.refreshSession();
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          新密码
          <input
            required
            autoComplete="new-password"
            type="password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 10 位"
          />
        </label>
        <label>
          再次输入
          <input
            required
            autoComplete="new-password"
            type="password"
            minLength={10}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? '正在保存…' : '保存密码'}
        </button>
      </form>
    </Modal>
  );
}
function Login({ onLocal }: { onLocal: () => void }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">A LITTLE MORE PRESENT</span>
          <h1>
            把时间，
            <br />
            留给在意的事。
          </h1>
          <p>
            一键记录，慢慢发现自己的节奏。
            <br />
            每一段投入，都值得被看见。
          </p>
          <div className="art-clock">
            <div className="art-orbit" />
            <Clock3 size={68} strokeWidth={1} />
            <span>Make room for your day.</span>
          </div>
        </div>
        <small>YOUR TIME. YOUR OWN PACE.</small>
      </div>
      <div className="login-panel">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-form">
          <div className="welcome-icon">
            <Sun size={27} />
          </div>
          <h2>新的一天，从这里开始</h2>
          <p className="muted">登录 MengDay，接着记录你的生活。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                if (!supabase) throw Error('尚未配置云服务，可以先在本机体验。');
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              邮箱
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入你的密码"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy || !supabase}>
              {busy ? '正在登录…' : '登录'}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="invite-note">
            <ShieldCheck size={15} />
            仅限受邀账号 · 忘记密码请联系管理员
          </p>
          <div className="login-divider">
            <span>或者</span>
          </div>
          <button className="button secondary full" onClick={onLocal}>
            先在本机体验
          </button>
          <p className="small muted centered">体验数据只保存在此设备，可随时导出备份。</p>
        </div>
        <small className="login-footer">MengDay · 时间里的每一天</small>
      </div>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [local, setLocal] = useState(() => sessionStorage.getItem('mengday-local') === 'true');
  const [store, setStore] = useState<Store | null>(null),
    [, render] = useState(0),
    [fatal, setFatal] = useState('');
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setFatal(error.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const forced = !!user?.app_metadata.force_password_change;
  const identity = user?.id ?? (local ? 'local' : '');
  useEffect(() => {
    if (!identity || forced) {
      setStore(null);
      return;
    }
    const s = new Store(identity, !user);
    setStore(s);
    const unsub = s.subscribe(() => render((n) => n + 1));
    s.init().catch((e) => setFatal(e.message));
    const sub =
      user && supabase
        ? supabase
            .channel(`state:${identity}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'user_states',
                filter: `user_id=eq.${identity}`,
              },
              () => {
                void s.sync();
              },
            )
            .subscribe()
        : null;
    return () => {
      unsub();
      s.dispose();
      if (sub) void supabase!.removeChannel(sub);
    };
  }, [identity, forced]);
  const logout = async () => {
    if (store) {
      await store.closeAndClear();
    }
    if (user) await supabase!.auth.signOut();
    setUser(null);
    setLocal(false);
    sessionStorage.removeItem('mengday-local');
    setStore(null);
  };
  if (!authReady)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" />
        <p>正在打开你的一天…</p>
      </div>
    );
  if (forced)
    return (
      <div className="loading-screen">
        <Brand />
        <PasswordForm forced onDone={() => {}} onClose={() => void logout()} />
      </div>
    );
  if (!identity)
    return (
      <Login
        onLocal={() => {
          sessionStorage.setItem('mengday-local', 'true');
          setLocal(true);
          setFatal('');
        }}
      />
    );
  if (!store?.value)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" />
        <p>{fatal || store?.error || '正在加载你的记录…'}</p>
        <button
          className="button secondary"
          onClick={() => {
            setFatal('');
            void store?.init().catch((e) => setFatal(e.message));
          }}
        >
          重新连接
        </button>
        <button className="text-button" onClick={() => void logout()}>
          返回登录
        </button>
      </div>
    );
  return <Workspace store={store} email={user?.email} onLogout={logout} />;
}

function Workspace({
  store,
  email,
  onLogout,
}: {
  store: Store;
  email?: string;
  onLogout: () => Promise<void>;
}) {
  const data = store.value!.data;
  const [page, setPage] = useState<Page>('today'),
    [now, setNow] = useState(Date.now()),
    [date, setDate] = useState(() => dateKey(Date.now(), data.settings.timezone));
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [recordPeriod, setRecordPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [entryRange, setEntryRange] = useState<{ start: number; end: number }>();
  const [deleteModal, setDeleteModal] = useState<Activity | null>(null),
    [lastChange, setLastChange] = useState<Change | null>(null);
  const [entryModal, setEntryModal] = useState<Entry | 'new' | null>(null),
    [activityModal, setActivityModal] = useState<Activity | null>(null),
    [quick, setQuick] = useState(false),
    [passwordModal, setPasswordModal] = useState(false),
    [logoutModal, setLogoutModal] = useState(false),
    [imported, setImported] = useState<Data | null>(null),
    [showConflict, setShowConflict] = useState(false);
  const [message, setMessage] = useState(''),
    [undo, setUndo] = useState<Entry | null>(null),
    [note, setNote] = useState(''),
    [noteStatus, setNoteStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const pendingNote = useRef<{ id: string; note: string } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [installEvent, setInstallEvent] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const [installHelp, setInstallHelp] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const running = data.entries.find((e) => e.end === null),
    active = data.activities.find((a) => a.id === running?.activityId),
    today = dateKey(now, data.settings.timezone);
  const todayTotals = totals(data, [today], now),
    todayMs = todayTotals.reduce((s, t) => s + t.ms, 0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        data.settings.theme === 'system'
          ? system.matches
            ? 'dark'
            : 'light'
          : data.settings.theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          document.documentElement.dataset.theme === 'dark' ? '#17191e' : '#f7f8fa',
        );
    };
    apply();
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [data.settings.theme]);
  useEffect(() => {
    if (!pendingNote.current) {
      setNote(running?.note ?? '');
    }
  }, [running?.id, running?.note]);
  useEffect(() => {
    const fn = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', fn);
    return () => window.removeEventListener('beforeinstallprompt', fn);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const notifyError = (e: unknown) =>
    setMessage(e instanceof Error ? e.message : '操作失败，请重试');
  const flushNote = async () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    const pending = pendingNote.current;
    if (!pending) return;
    await store.mutate((d) => {
      const e = d.entries.find((e) => e.id === pending.id);
      if (e) e.note = pending.note;
    });
    if (pendingNote.current === pending) pendingNote.current = null;
    setNoteStatus('已保存');
  };
  useEffect(() => {
    const flush = () => {
      if (document.hidden) void flushNote().catch(notifyError);
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingNote.current) {
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', warn);
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, [store]);
  const act = async (fn: (d: Data) => void) => {
    await flushNote();
    await store.mutate(fn);
  };
  const commitChange = async (change: Change) => {
    await act((d) => applyChange(d, change));
    setLastChange(change);
    setMessage(change.label);
  };
  const undoChange = () => {
    if (!lastChange) return;
    void act((d) => applyChange(d, lastChange, true))
      .then(() => {
        setLastChange(null);
        setMessage('已撤销上次编辑');
      })
      .catch(notifyError);
  };
  const toggle = async (name: string, note = '') => {
    if (busy) return;
    setBusy(true);
    try {
      let discarded = false;
      await act((d) => {
        discarded = toggleTimer(d, name, Date.now(), note).discarded;
      });
      if (discarded) setMessage('已忽略不足一分钟的计时');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string) => {
    const e = data.entries.find((e) => e.id === id);
    if (!e) return;
    void act((d) => {
      d.entries = d.entries.filter((e) => e.id !== id);
    })
      .then(() => {
        setUndo(e);
        setMessage('记录已删除');
      })
      .catch(notifyError);
  };
  const mutateSetting = (fn: (d: Data) => void) => void act(fn).catch(notifyError);
  const dayEntries = (day: string) => {
    const [start, end] = dayBounds(day, data.settings.timezone);
    return data.entries
      .filter((e) => e.start < end && (e.end ?? now) > start)
      .sort((a, b) => b.start - a.start);
  };
  const exportBackup = () =>
    void flushNote()
      .then(() => DownloadFile(`MengDay-${today}.json`, backup(store.value!.data)))
      .catch(notifyError);
  const nav = (p: Page) => {
    void flushNote().catch(notifyError);
    setPage(p);
    if (p === 'history') setRecordPeriod('week');
    if (p === 'history' || p === 'stats') setDate(today);
    window.scrollTo({ top: 0 });
  };
  const renderEntries = (entries: Entry[], compact = false) =>
    entries.length ? (
      <div className={`timeline ${compact ? 'compact' : ''}`}>
        {entries.map((e) => {
          const a = data.activities.find((a) => a.id === e.activityId)!;
          return (
            <button
              className="timeline-row"
              key={e.id}
              onClick={() =>
                void flushNote()
                  .then(() =>
                    setEntryModal(store.value!.data.entries.find((x) => x.id === e.id) ?? e),
                  )
                  .catch(notifyError)
              }
            >
              <div className="timeline-time">
                {formatInTimeZone(e.start, data.settings.timezone, 'HH:mm')}
                <span>
                  {e.end ? formatInTimeZone(e.end, data.settings.timezone, 'HH:mm') : '进行中'}
                </span>
              </div>
              <div className="timeline-marker" style={{ '--activity': a.color } as CSSProperties} />
              <ActivityIcon activity={a} size={18} />
              <div className="timeline-content">
                <strong>
                  {a.name}
                  {e.end === null && <i className="live-dot" />}
                </strong>
                <p>{e.note || a.category}</p>
              </div>
              <span className="timeline-duration">
                {human(duration(e, -Infinity, Infinity, now))}
              </span>
            </button>
          );
        })}
      </div>
    ) : (
      <Empty
        icon={<CalendarDays size={27} />}
        action={
          <button className="text-button" onClick={() => setEntryModal('new')}>
            补记一段时间 <Plus size={14} />
          </button>
        }
      >
        这一天，还留着空白。
        <br />
        <small>从一段小小的投入开始吧。</small>
      </Empty>
    );
  const goalActivities = data.activities.filter((a) => !a.archived && a.goalMinutes > 0);
  const goalProgress = (a: Activity) =>
    totals(data, rangeDays(today, a.goalPeriod), now).find((t) => t.activity.id === a.id)!.ms /
    (a.goalMinutes * 60000);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">记录生活的每一面</div>
        <nav>
          {pages.map((p) => (
            <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => nav(p.id)}>
              <p.icon size={20} />
              <span>{p.label}</span>
              {page === p.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="daily-quote">
            <div className="quote-spark">
              <Sparkles size={20} />
            </div>
            <p>
              不必填满每一分钟，
              <br />
              只需认真度过这一刻。
            </p>
            <span>ONE MOMENT AT A TIME</span>
          </div>
          <button className="profile" onClick={() => nav('settings')}>
            <span className="avatar">{email ? email[0].toUpperCase() : 'M'}</span>
            <span>
              <strong>{email?.split('@')[0] ?? '我的一天'}</strong>
              <small>{store.local ? '本机体验' : '私人时间空间'}</small>
            </span>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="desktop-breadcrumb">
            我的空间 <span>/</span> {pages.find((p) => p.id === page)?.label}
          </span>
          <div className="topbar-right">
            <button
              className={`sync-status ${store.value!.conflict ? 'warning' : ''}`}
              title={store.error || store.status}
              onClick={() => {
                if (store.value!.conflict) setShowConflict(true);
                else void store.sync();
              }}
            >
              {store.local ? (
                <Monitor size={14} />
              ) : store.status.includes('离线') ? (
                <CloudOff size={14} />
              ) : (
                <Cloud size={14} />
              )}
              <span>{store.status}</span>
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="切换明暗主题"
              onClick={() =>
                mutateSetting((d) => {
                  d.settings.theme =
                    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                })
              }
            >
              {document.documentElement.dataset.theme === 'dark' ? (
                <Moon size={18} />
              ) : (
                <Sun size={18} />
              )}
            </button>
          </div>
        </header>
        {store.local && (
          <div className="local-banner">
            <Monitor size={15} />
            <span>本机体验 · 记录保存在此设备，登录后可通过备份导入账号。</span>
            <button onClick={() => setLogoutModal(true)}>
              登录 <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {store.value!.conflict && (
          <div className="notice warning">
            <CloudOff size={18} />
            <span>另一台设备也修改了记录，你的内容已保留。</span>
            <button className="text-button" onClick={() => setShowConflict(true)}>
              处理冲突
            </button>
          </div>
        )}
        {needRefresh && (
          <div className="notice">
            <Sparkles size={18} />
            <span>新版本已准备好。</span>
            <button
              className="text-button"
              onClick={() =>
                void flushNote()
                  .then(() => updateServiceWorker(true))
                  .catch(notifyError)
              }
            >
              保存并更新
            </button>
          </div>
        )}
        <div className="page-body">
          {page === 'today' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {formatInTimeZone(now, data.settings.timezone, 'yyyy年 M月 d日')} ·{' '}
                    {
                      ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][
                        Number(formatInTimeZone(now, data.settings.timezone, 'i')) % 7
                      ]
                    }
                  </p>
                  <h1>
                    今天，把时间花在哪里<span className="heading-dot">？</span>
                  </h1>
                  <p className="muted">每一段专注，都在塑造你的一天。</p>
                </div>
                <button className="button secondary" onClick={() => setEntryModal('new')}>
                  <Plus size={17} />
                  补记时间
                </button>
              </div>
              <div className="dashboard-grid">
                <section className="main-column">
                  <div
                    className={`timer-card ${running ? 'is-running' : ''}`}
                    style={
                      active ? ({ '--active-color': active.color } as CSSProperties) : undefined
                    }
                  >
                    <div className="timer-card-top">
                      <span className="timer-label">
                        <span className={`status-dot ${running ? 'pulsing' : ''}`} />
                        {running ? '正在投入' : '准备好，开始下一段'}
                      </span>
                      <span className="timer-decoration">MAKE TIME FOR WHAT MATTERS</span>
                    </div>
                    <div className="timer-center">
                      {active ? (
                        <ActivityIcon activity={active} size={24} />
                      ) : (
                        <div className="idle-icon">
                          <Sparkles size={24} />
                        </div>
                      )}
                      <h2>{active?.name ?? '给此刻，一个开始'}</h2>
                      <div className="timer-digits" aria-label="当前计时">
                        {clockText(running ? now - running.start : 0)}
                      </div>
                      {running ? (
                        <button
                          className="timer-button"
                          disabled={busy}
                          onClick={() => void toggle(active!.name)}
                        >
                          <Square size={15} fill="currentColor" />
                          结束这段记录
                        </button>
                      ) : (
                        <button className="timer-button" onClick={() => setQuick(true)}>
                          <Play size={16} fill="currentColor" />
                          开始记录
                        </button>
                      )}
                    </div>
                    <div className="timer-note">
                      <span>
                        <PencilSmall />
                        {running ? '此刻的想法' : '留一点空间，给此刻的自己'}
                      </span>
                      {running && (
                        <>
                          <textarea
                            aria-label="当前活动备注"
                            rows={2}
                            maxLength={10000}
                            placeholder="写下具体内容，或一个小小的想法…"
                            value={note}
                            onBlur={() => void flushNote().catch(notifyError)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setNote(value);
                              setNoteStatus('保存中…');
                              pendingNote.current = { id: running.id, note: value };
                              if (noteTimer.current) clearTimeout(noteTimer.current);
                              noteTimer.current = setTimeout(
                                () => void flushNote().catch(notifyError),
                                350,
                              );
                            }}
                          />
                          <small>{noteStatus || '备注自动保存'}</small>
                        </>
                      )}
                    </div>
                  </div>
                  <section className="activities-section">
                    <div className="section-heading">
                      <h2>
                        我的活动 <span>{data.activities.filter((a) => !a.archived).length}</span>
                      </h2>
                      <button className="text-button" onClick={() => setQuick(true)}>
                        <Plus size={16} />
                        新活动
                      </button>
                    </div>
                    <div className="activity-grid">
                      {data.activities
                        .filter((a) => !a.archived)
                        .sort((a, b) => a.order - b.order)
                        .map((a) => {
                          const ms = todayTotals.find((t) => t.activity.id === a.id)?.ms ?? 0,
                            isActive = a.id === active?.id,
                            last = data.entries
                              .filter((e) => e.activityId === a.id)
                              .sort((a, b) => b.start - a.start)[0];
                          return (
                            <div key={a.id} className="activity-card-wrap">
                              <button
                                disabled={busy}
                                className={`activity-card ${isActive ? 'active' : ''}`}
                                style={{ '--activity': a.color } as CSSProperties}
                                onClick={() => void toggle(a.name)}
                              >
                                <div className="activity-top">
                                  <ActivityIcon activity={a} />
                                  <span className="activity-play">
                                    {isActive ? (
                                      <Square size={13} fill="currentColor" />
                                    ) : (
                                      <Play size={13} fill="currentColor" />
                                    )}
                                  </span>
                                </div>
                                <h3>{a.name}</h3>
                                <p className="activity-note">
                                  {isActive
                                    ? note || '正在记录…'
                                    : last?.end != null &&
                                        dateKey(last.end, data.settings.timezone) === today
                                      ? last.note || a.category
                                      : a.category}
                                </p>
                                <div className="activity-bottom">
                                  <span>{human(ms)}</span>
                                  {isActive ? (
                                    <span className="recording">
                                      <i />
                                      计时中
                                    </span>
                                  ) : (
                                    <span>今日</span>
                                  )}
                                </div>
                              </button>
                              <ActivityMenu
                                activity={a}
                                onEdit={() => setActivityModal(a)}
                                onDelete={() => setDeleteModal(a)}
                              />
                            </div>
                          );
                        })}
                      <button className="add-activity-card" onClick={() => setQuick(true)}>
                        <span>
                          <Plus size={23} />
                        </span>
                        <strong>新的可能</strong>
                        <small>添加一项活动</small>
                      </button>
                    </div>
                  </section>
                </section>
                <aside className="right-column">
                  <section className="panel overview-panel">
                    <div className="section-heading">
                      <h2>今日概览</h2>
                      <span className="subtle-icon">
                        <Sun size={19} />
                      </span>
                    </div>
                    <div className="total-duration">
                      <strong>{Math.floor(todayMs / 3600000)}</strong>
                      <span>小时</span>
                      <strong>{Math.floor(todayMs / 60000) % 60}</strong>
                      <span>分钟</span>
                    </div>
                    <p className="small muted">认真记录的时间</p>
                    <div className="distribution-bar">
                      {todayMs ? (
                        todayTotals
                          .filter((t) => t.ms > 0)
                          .map((t) => (
                            <span
                              key={t.activity.id}
                              style={{
                                background: t.activity.color,
                                width: `${(t.ms / todayMs) * 100}%`,
                              }}
                              title={`${t.activity.name} ${human(t.ms)}`}
                            />
                          ))
                      ) : (
                        <span className="empty-bar" />
                      )}
                    </div>
                    <div className="overview-counts">
                      <div>
                        <strong>
                          {dayEntries(today).length}
                          <span> 段</span>
                        </strong>
                        <small>时间记录</small>
                      </div>
                      <div>
                        <strong>
                          {todayTotals.filter((t) => t.ms > 0).length}
                          <span> 项</span>
                        </strong>
                        <small>投入的活动</small>
                      </div>
                    </div>
                  </section>
                  <section className="panel today-timeline">
                    <div className="section-heading">
                      <h2>今天的足迹</h2>
                      <button
                        className="icon-button"
                        aria-label="查看全部记录"
                        onClick={() => nav('history')}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    {renderEntries(dayEntries(today).slice(0, 4), true)}
                    {dayEntries(today).length > 0 && (
                      <button
                        className="text-button full timeline-all"
                        onClick={() => nav('history')}
                      >
                        查看完整时间轴 <ChevronRight size={15} />
                      </button>
                    )}
                  </section>
                  <section className="panel goal-panel">
                    <div className="section-heading">
                      <h2>
                        <Target size={17} />
                        一点点，靠近目标
                      </h2>
                      <button
                        className="icon-button"
                        aria-label="设置目标"
                        onClick={() => nav('settings')}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    {goalActivities.length ? (
                      goalActivities.slice(0, 3).map((a) => {
                        const ratio = goalProgress(a);
                        return (
                          <div className="goal" key={a.id}>
                            <div>
                              <span>
                                {a.name}
                                <small> / {a.goalPeriod === 'day' ? '每日' : '每周'}</small>
                              </span>
                              <strong>{Math.round(ratio * 100)}%</strong>
                            </div>
                            <div className="progress-track">
                              <span
                                style={{
                                  width: `${Math.min(100, ratio * 100)}%`,
                                  background: a.color,
                                }}
                              />
                            </div>
                            <small className="muted">目标 {human(a.goalMinutes * 60000)}</small>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <p className="muted small">
                          给喜欢的事多一点时间。
                          <br />
                          从一个小目标开始，不必着急。
                        </p>
                        <button className="text-button" onClick={() => nav('settings')}>
                          设置我的目标 <ChevronRight size={14} />
                        </button>
                      </>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === 'history' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR DAYS, IN DETAIL</p>
                  <h1>时间有迹可循</h1>
                  <p className="muted">那些投入过的时刻，都在这里。</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setEntryRange(
                      recordPeriod === 'day'
                        ? manualRange(date, data.settings.timezone)
                        : undefined,
                    );
                    setEntryModal('new');
                  }}
                >
                  <Plus size={17} />
                  补记时间
                </button>
              </div>
              <Timeline
                period={recordPeriod}
                setPeriod={setRecordPeriod}
                data={data}
                now={now}
                date={date}
                setDate={setDate}
                onEdit={(entry) =>
                  void flushNote()
                    .then(() =>
                      setEntryModal(
                        store.value!.data.entries.find((e) => e.id === entry.id) ?? entry,
                      ),
                    )
                    .catch(notifyError)
                }
                onApply={commitChange}
                canUndo={!!lastChange}
                onUndo={undoChange}
              />
            </>
          )}
          {page === 'stats' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">A LITTLE PERSPECTIVE</p>
                  <h1>看见时间的形状</h1>
                  <p className="muted">了解自己的节奏，也给改变留一点空间。</p>
                </div>
                <div className="segmented">
                  {(['day', 'week', 'month'] as const).map((p, i) => (
                    <button
                      key={p}
                      className={period === p ? 'selected' : ''}
                      onClick={() => setPeriod(p)}
                    >
                      {['日', '周', '月'][i]}
                    </button>
                  ))}
                </div>
              </div>
              <Stats
                data={data}
                date={date}
                setDate={setDate}
                today={today}
                period={period}
                now={now}
              />
            </>
          )}
          {page === 'settings' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">MAKE IT YOURS</p>
                  <h1>按照你的方式</h1>
                  <p className="muted">一些小设置，让记录更顺手。</p>
                </div>
                <button className="button secondary" onClick={() => setQuick(true)}>
                  <Plus size={17} />
                  新建活动
                </button>
              </div>
              <div className="settings-grid">
                <section className="panel settings-activities">
                  <div className="section-heading">
                    <h2>活动与目标</h2>
                    <span className="muted small">点击活动进行编辑</span>
                  </div>
                  {[...data.activities]
                    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order)
                    .map((a, i) => (
                      <div key={a.id} className={`manage-activity ${a.archived ? 'archived' : ''}`}>
                        <button className="manage-name" onClick={() => setActivityModal(a)}>
                          <ActivityIcon activity={a} />
                          <span>
                            <strong>{a.name}</strong>
                            <small>
                              {a.archived ? '已归档' : a.category}
                              {a.goalMinutes > 0
                                ? ` · ${a.goalPeriod === 'day' ? '每日' : '每周'} ${human(a.goalMinutes * 60000)}`
                                : ''}
                            </small>
                          </span>
                        </button>
                        <div className="manage-actions">
                          <button
                            className="icon-button"
                            aria-label={`上移${a.name}`}
                            disabled={i === 0}
                            onClick={() =>
                              mutateSetting((d) => {
                                const list = [...d.activities].sort(
                                  (x, y) =>
                                    Number(x.archived) - Number(y.archived) || x.order - y.order,
                                );
                                [list[i - 1], list[i]] = [list[i], list[i - 1]];
                                list.forEach((x, n) => (x.order = n));
                              })
                            }
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`下移${a.name}`}
                            disabled={i === data.activities.length - 1}
                            onClick={() =>
                              mutateSetting((d) => {
                                const list = [...d.activities].sort(
                                  (x, y) =>
                                    Number(x.archived) - Number(y.archived) || x.order - y.order,
                                );
                                [list[i], list[i + 1]] = [list[i + 1], list[i]];
                                list.forEach((x, n) => (x.order = n));
                              })
                            }
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`${a.archived ? '恢复' : '归档'}${a.name}`}
                            onClick={() =>
                              mutateSetting((d) => {
                                if (active?.id === a.id && !a.archived)
                                  throw Error('请先结束该活动的计时');
                                d.activities.find((x) => x.id === a.id)!.archived = !a.archived;
                              })
                            }
                          >
                            {a.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                </section>
                <div className="settings-right">
                  <section className="panel">
                    <h2>偏好设置</h2>
                    <label>
                      外观
                      <div className="theme-options">
                        {(
                          [
                            { id: 'light', icon: Sun, label: '浅色' },
                            { id: 'dark', icon: Moon, label: '深色' },
                            { id: 'system', icon: Monitor, label: '跟随系统' },
                          ] as const
                        ).map((t) => (
                          <button
                            key={t.id}
                            className={data.settings.theme === t.id ? 'selected' : ''}
                            onClick={() =>
                              mutateSetting((d) => {
                                d.settings.theme = t.id;
                              })
                            }
                          >
                            <t.icon size={21} />
                            <span>{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </label>
                    <label>
                      统计时区
                      <select
                        value={data.settings.timezone}
                        onChange={(e) =>
                          mutateSetting((d) => {
                            d.settings.timezone = e.target.value;
                          })
                        }
                      >
                        {Array.from(
                          new Set([
                            data.settings.timezone,
                            'Asia/Shanghai',
                            'Asia/Hong_Kong',
                            'Asia/Tokyo',
                            'Asia/Singapore',
                            'Europe/London',
                            'Europe/Paris',
                            'America/New_York',
                            'America/Los_Angeles',
                            'Australia/Sydney',
                            'UTC',
                          ]),
                        ).map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="settings-link install-link"
                      onClick={() => {
                        if (installEvent) void installEvent.prompt();
                        else setInstallHelp(true);
                      }}
                    >
                      <Plus size={18} />
                      <span>添加到主屏幕</span>
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <section className="panel">
                    <h2>数据与备份</h2>
                    <button className="settings-link" onClick={exportBackup}>
                      <Download size={18} />
                      <span>
                        导出完整备份 <small>JSON · 包含活动、备注和设置</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="settings-link"
                      onClick={() =>
                        void flushNote()
                          .then(() =>
                            DownloadFile(
                              `MengDay-${today}.csv`,
                              csv(store.value!.data),
                              'text/csv;charset=utf-8',
                            ),
                          )
                          .catch(notifyError)
                      }
                    >
                      <ChartNoAxesCombined size={18} />
                      <span>
                        导出时间记录 <small>CSV · 可用电子表格打开</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <label className="settings-link file-label">
                      <Upload size={18} />
                      <span>
                        从备份恢复 <small>先预览，再合并到当前记录</small>
                      </span>
                      <ChevronRight size={16} />
                      <input
                        aria-label="导入备份"
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          if (f.size > 12000000) {
                            setMessage('备份文件不能超过 12 MB');
                            return;
                          }
                          try {
                            await flushNote();
                            setImported(parseBackup(await f.text()));
                          } catch (e) {
                            notifyError(e);
                          }
                        }}
                      />
                    </label>
                  </section>
                  <section className="panel">
                    <h2>我的账号</h2>
                    <div className="account-info">
                      <span className="avatar">{email?.[0].toUpperCase() ?? 'M'}</span>
                      <span>
                        <strong>{email ?? '本机体验'}</strong>
                        <small>{store.local ? '只保存在当前设备' : '记录仅自己可见'}</small>
                      </span>
                    </div>
                    {!store.local && (
                      <button className="settings-link" onClick={() => setPasswordModal(true)}>
                        <KeyRound size={18} />
                        <span>修改密码</span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    <button className="settings-link" onClick={() => setLogoutModal(true)}>
                      <LogOut size={18} />
                      <span>{store.local ? '返回登录' : '退出登录'}</span>
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <p className="app-version">
                    MengDay 1.1 <span>·</span> Made for your everyday.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        <footer className="page-footer">
          <span>MengDay</span> 小小记录，慢慢积累。
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {pages.map((p) => (
          <button className={page === p.id ? 'active' : ''} key={p.id} onClick={() => nav(p.id)}>
            <p.icon size={22} />
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
      {page !== 'today' && running && (
        <button className="floating-timer" onClick={() => nav('today')}>
          <i className="live-dot" />
          <span>{active?.name}</span>
          <strong>{clockText(now - running.start)}</strong>
          <ChevronRight size={17} />
        </button>
      )}
      {quick && (
        <QuickForm
          data={data}
          onClose={() => setQuick(false)}
          onStart={async (name, note, appearance) => {
            let discarded = false;
            await act((d) => {
              const a = ensureActivity(d, name);
              if (appearance) Object.assign(a, appearance);
              discarded = toggleTimer(d, name, Date.now(), note, 'start').discarded;
            });
            setQuick(false);
            if (discarded) setMessage('已忽略不足一分钟的计时');
          }}
          onCreate={async (name, appearance) => {
            await act((d) => {
              const a = ensureActivity(d, name);
              if (appearance) Object.assign(a, appearance);
            });
            setQuick(false);
            setMessage('活动已保存，之后可直接选择');
          }}
        />
      )}
      {entryModal && (
        <EntryForm
          data={data}
          entry={entryModal === 'new' ? undefined : entryModal}
          initialRange={entryModal === 'new' && page === 'history' ? entryRange : undefined}
          onSave={act}
          onClose={() => setEntryModal(null)}
          onDelete={remove}
        />
      )}
      {activityModal && (
        <ActivityForm
          activity={activityModal}
          onDelete={() => {
            setActivityModal(null);
            setDeleteModal(activityModal);
          }}
          onClose={() => setActivityModal(null)}
          onSave={async (a) => {
            await act((d) => {
              const i = d.activities.findIndex((x) => x.id === a.id);
              d.activities[i] = a;
            });
          }}
        />
      )}
      {deleteModal && (
        <DeleteActivityModal
          activity={deleteModal}
          data={data}
          onClose={() => setDeleteModal(null)}
          onApply={commitChange}
        />
      )}
      {passwordModal && (
        <PasswordForm
          onClose={() => setPasswordModal(false)}
          onDone={() => {
            setPasswordModal(false);
            setMessage('密码已更新');
          }}
        />
      )}
      {imported && (
        <ImportModal
          data={data}
          imported={imported}
          onClose={() => setImported(null)}
          onImport={async (prefer) => {
            await act((d) => Object.assign(d, mergeData(d, imported, prefer)));
            setImported(null);
            setMessage('备份已合并');
          }}
        />
      )}
      {showConflict && store.value!.conflict && (
        <ConflictModal
          local={data}
          remote={store.value!.conflict.data}
          onClose={() => setShowConflict(false)}
          onResolve={async (d) => {
            await flushNote();
            await store.resolve(d);
            setShowConflict(false);
          }}
        />
      )}
      {logoutModal && (
        <Modal
          title={store.local ? '返回登录' : '退出当前账号'}
          description={
            store.local
              ? '本机体验数据将保留在此设备，建议先导出备份，再登录账号导入。'
              : '退出会清理此设备上的账号缓存。'
          }
          onClose={() => setLogoutModal(false)}
        >
          {store.value!.pending && (
            <p className="error">还有未同步的记录，请先同步，或导出备份后再退出。</p>
          )}
          <div className="modal-actions">
            <button className="button secondary" onClick={exportBackup}>
              <Download size={17} />
              导出备份
            </button>
            <button
              className="button primary"
              disabled={!store.local && store.value!.pending}
              onClick={async () => {
                try {
                  await flushNote();
                  if (store.local) {
                    sessionStorage.removeItem('mengday-local');
                    location.reload();
                  } else if (!store.value!.pending) await onLogout();
                  else setMessage('请等待同步完成再退出');
                } catch (e) {
                  notifyError(e);
                }
              }}
            >
              {store.local ? '返回登录' : '安全退出'}
            </button>
          </div>
          {!store.local && store.value!.pending && (
            <button
              className="text-button full"
              onClick={() =>
                void flushNote()
                  .then(async () => {
                    DownloadFile('MengDay-unsynced.json', backup(store.value!.data));
                    await onLogout();
                  })
                  .catch(notifyError)
              }
            >
              导出未同步备份并退出
            </button>
          )}
        </Modal>
      )}
      {installHelp && (
        <Modal title="把 MengDay 放到主屏幕" onClose={() => setInstallHelp(false)}>
          <div className="install-instructions">
            <img src="/icon.svg" alt="MengDay" />
            <p>iPhone / iPad：在 Safari 打开本页，轻点分享按钮，再选择「添加到主屏幕」。</p>
            <p>
              Android / 电脑：使用 Chrome 或
              Edge，打开浏览器菜单，选择「安装应用」或「添加到主屏幕」。
            </p>
            <p className="muted small">安装后可独立打开，已加载的记录支持离线使用。</p>
          </div>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          {lastChange && message === lastChange.label && <button onClick={undoChange}>撤销</button>}
          {undo && message === '记录已删除' && (
            <button
              onClick={() => {
                void act((d) => {
                  d.entries.push(undo);
                })
                  .then(() => {
                    setUndo(null);
                    setMessage('已恢复记录');
                  })
                  .catch(notifyError);
              }}
            >
              撤销
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function PencilSmall() {
  return <span className="note-line-icon">✎</span>;
}
function DateNav({
  date,
  setDate,
  today,
  step = 1,
  unit = 'day',
}: {
  date: string;
  setDate: (d: string) => void;
  today: string;
  step?: number;
  unit?: 'day' | 'month';
}) {
  return (
    <div className="date-nav">
      <button
        className="icon-button"
        aria-label="上一期"
        onClick={() => setDate(unit === 'month' ? shiftMonth(date, -1) : shiftDate(date, -step))}
      >
        <ChevronLeft size={19} />
      </button>
      <input
        aria-label="选择日期"
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) setDate(e.target.value);
        }}
      />
      <button
        className="icon-button"
        aria-label="下一期"
        onClick={() => setDate(unit === 'month' ? shiftMonth(date, 1) : shiftDate(date, step))}
      >
        <ChevronRight size={19} />
      </button>
      {date !== today && (
        <button className="text-button" onClick={() => setDate(today)}>
          今天
        </button>
      )}
    </div>
  );
}
function Distribution({
  data,
  days,
  now,
  grouping = 'activity',
}: {
  data: Data;
  days: string[];
  now: number;
  grouping?: 'activity' | 'category';
}) {
  const list = (
      grouping === 'category'
        ? categoryTotals(data, days, now).map((g) => ({
            ms: g.ms,
            activity: { id: g.name, name: g.name, color: g.color },
          }))
        : totals(data, days, now)
    )
      .filter((t) => t.ms > 0)
      .sort((a, b) => b.ms - a.ms),
    total = list.reduce((s, t) => s + t.ms, 0);
  let offset = 0;
  const gradient = list
    .map((t) => {
      const start = offset;
      offset += (t.ms / total) * 100;
      return `${t.activity.color} ${start}% ${offset}%`;
    })
    .join(',');
  return (
    <>
      <div
        className="donut"
        style={{ background: total ? `conic-gradient(${gradient})` : undefined }}
        role="img"
        aria-label={
          total
            ? list.map((t) => `${t.activity.name} ${Math.round((t.ms / total) * 100)}%`).join('，')
            : '暂无记录'
        }
      >
        <div>
          <span>累计投入</span>
          <strong>{(total / 3600000).toFixed(1)}</strong>
          <small>小时</small>
        </div>
      </div>
      <div className="distribution-legend">
        {list.length ? (
          list.map((t) => (
            <div key={t.activity.id}>
              <i style={{ background: t.activity.color }} />
              <span>{t.activity.name}</span>
              <strong>{human(t.ms)}</strong>
              <small>{Math.round((t.ms / total) * 100)}%</small>
            </div>
          ))
        ) : (
          <p className="muted centered small">记录后，你的时间分布会在这里呈现。</p>
        )}
      </div>
    </>
  );
}
function Stats({
  data,
  date,
  setDate,
  today,
  period,
  now,
}: {
  data: Data;
  date: string;
  setDate: (d: string) => void;
  today: string;
  period: 'day' | 'week' | 'month';
  now: number;
}) {
  const [grouping, setGrouping] = useState<'activity' | 'category'>('activity');
  const days = rangeDays(date, period),
    list = totals(data, days, now),
    total = list.reduce((s, t) => s + t.ms, 0),
    daily = days.map((day) => ({
      day,
      ms: totals(data, [day], now).reduce((s, t) => s + t.ms, 0),
    })),
    max = Math.max(...daily.map((d) => d.ms), 3600000),
    [s, e] = [
      dayBounds(days[0], data.settings.timezone)[0],
      dayBounds(days.at(-1)!, data.settings.timezone)[1],
    ],
    entries = data.entries.filter((x) => duration(x, s, e, now) > 0);
  return (
    <>
      <div className="stats-toolbar">
        <div className="stats-grouping" role="group" aria-label="统计分组">
          <button aria-pressed={grouping === 'activity'} onClick={() => setGrouping('activity')}>
            按活动
          </button>
          <button aria-pressed={grouping === 'category'} onClick={() => setGrouping('category')}>
            按分类
          </button>
        </div>
        <DateNav
          date={date}
          setDate={setDate}
          today={today}
          step={period === 'week' ? 7 : 1}
          unit={period === 'month' ? 'month' : 'day'}
        />
        <span className="muted small">
          {days[0]} — {days.at(-1)}
        </span>
      </div>
      <div className="stat-cards">
        <div className="panel">
          <span>
            <Clock3 size={17} />
            累计记录
          </span>
          <strong>{human(total)}</strong>
          <small>每一刻都算数</small>
        </div>
        <div className="panel">
          <span>
            <CalendarDays size={17} />
            日均投入
          </span>
          <strong>{human(total / days.length)}</strong>
          <small>按本期 {days.length} 天计算</small>
        </div>
        <div className="panel">
          <span>
            <Sparkles size={17} />
            记录片段
          </span>
          <strong>
            {entries.length}
            <small> 段</small>
          </strong>
          <small>{list.filter((t) => t.ms > 0).length} 项不同的活动</small>
        </div>
      </div>
      <div className="stats-grid">
        <section className="panel trend-panel">
          <div className="section-heading">
            <h2>投入的节奏</h2>
            <span className="small muted">小时</span>
          </div>
          <div className="chart-area">
            <div className="chart-axis">
              <span>{(max / 3600000).toFixed(1)}</span>
              <span>{(max / 7200000).toFixed(1)}</span>
              <span>0</span>
            </div>
            <div className="bar-chart" style={{ '--bars': days.length } as CSSProperties}>
              {daily.map((d) => (
                <div className="bar-column" key={d.day}>
                  <div className="bar-space">
                    <div
                      className={`chart-bar ${d.day === today ? 'current' : ''}`}
                      style={{ height: `${(d.ms / max) * 100}%` }}
                      title={`${d.day} ${human(d.ms)}`}
                      aria-label={`${d.day} ${human(d.ms)}`}
                    >
                      {days.length <= 7 && d.ms > 0 && <span>{(d.ms / 3600000).toFixed(1)}</span>}
                    </div>
                  </div>
                  <small>
                    {days.length <= 7
                      ? `${Number(d.day.slice(-2))}日`
                      : Number(d.day.slice(-2)) % 5 === 0 || d.day === days[0]
                        ? Number(d.day.slice(-2))
                        : ''}
                  </small>
                </div>
              ))}
            </div>
          </div>
          {!total && <p className="muted small centered">还没有记录。第一段投入，会点亮这里。</p>}
        </section>
        <section className="panel">
          <h2>时间都去哪了</h2>
          <Distribution data={data} days={days} now={now} grouping={grouping} />
        </section>
      </div>
      <section className="panel activity-report">
        <div className="section-heading">
          <h2>{grouping === 'category' ? '分类明细' : '活动明细'}</h2>
          <span className="muted small">按投入时长排序</span>
        </div>
        {grouping === 'category' ? (
          categoryTotals(data, days, now).length ? (
            categoryTotals(data, days, now).map((g) => (
              <details className="category-report" key={g.name}>
                <summary>
                  <i style={{ background: g.color }} />
                  <strong>{g.name}</strong>
                  <span>
                    {human(g.ms)} · {Math.round((g.ms / total) * 100)}%
                  </span>
                </summary>
                {g.activities.map((t) => (
                  <div className="report-row" key={t.activity.id}>
                    <ActivityIcon activity={t.activity} />
                    <span>
                      <strong>{t.activity.name}</strong>
                    </span>
                    <strong>{human(t.ms)}</strong>
                    <small>{Math.round((t.ms / g.ms) * 100)}% 本类</small>
                  </div>
                ))}
              </details>
            ))
          ) : (
            <Empty>开始记录后，看看各类活动的时间分布。</Empty>
          )
        ) : list.filter((t) => t.ms > 0).length ? (
          list
            .filter((t) => t.ms > 0)
            .sort((a, b) => b.ms - a.ms)
            .map((t) => (
              <div className="report-row" key={t.activity.id}>
                <ActivityIcon activity={t.activity} />
                <span>
                  <strong>{t.activity.name}</strong>
                  <small>{t.activity.category}</small>
                </span>
                <div className="progress-track">
                  <span
                    style={{ width: `${(t.ms / total) * 100}%`, background: t.activity.color }}
                  />
                </div>
                <strong>{human(t.ms)}</strong>
              </div>
            ))
        ) : (
          <Empty>开始记录后，看看哪些事占据了你的一天。</Empty>
        )}
      </section>
    </>
  );
}
function QuickForm({
  data,
  onClose,
  onStart,
  onCreate,
}: {
  data: Data;
  onClose: () => void;
  onStart: (name: string, note: string, appearance?: Appearance) => Promise<void>;
  onCreate: (name: string, appearance?: Appearance) => Promise<void>;
}) {
  const [name, setName] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>();
  const run = async (start: boolean) => {
    setBusy(true);
    try {
      if (start) await onStart(name, note, appearance);
      else await onCreate(name, appearance);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="此刻，想做些什么？"
      description="选一个熟悉的活动，或为新的投入起个名字。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(true);
        }}
      >
        <label>
          活动名称
          <NameInput
            data={data}
            value={name}
            onChange={(name) => {
              setName(name);
              setAppearance(undefined);
            }}
          />
        </label>
        <details className="appearance-details">
          <summary>颜色与图案</summary>
          <AppearancePicker
            value={
              appearance ??
              data.activities.find(
                (a) => a.name.trim().toLowerCase() === name.trim().toLowerCase(),
              ) ?? { color: palette[data.activities.length % palette.length], icon: 'Pencil' }
            }
            onChange={setAppearance}
          />
        </details>
        <label>
          备注 <span className="muted">可选 · 仅用于这次记录</span>
          <textarea
            rows={3}
            maxLength={10000}
            placeholder="具体内容，或此刻的想法…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !name.trim() || !!note.trim()}
            title={note.trim() ? '填写备注后，请开始记录以保存备注' : '只创建活动，不开始计时'}
            onClick={() => void run(false)}
          >
            仅添加活动
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="button primary">
            <Play size={15} fill="currentColor" />
            开始记录
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportModal({
  data,
  imported,
  onClose,
  onImport,
}: {
  data: Data;
  imported: Data;
  onClose: () => void;
  onImport: (prefer: 'local' | 'incoming') => Promise<void>;
}) {
  const [prefer, setPrefer] = useState<'local' | 'incoming'>('local'),
    [error, setError] = useState('');
  const duplicates = imported.entries.filter((e) => data.entries.some((x) => x.id === e.id)).length;
  return (
    <Modal
      title="恢复备份"
      description="按记录 ID 合并，不会清空现有记录。时间重叠时会阻止导入。"
      onClose={onClose}
    >
      <div className="backup-preview">
        <div>
          <strong>{imported.activities.length}</strong>项活动
        </div>
        <div>
          <strong>{imported.entries.length}</strong>段记录
        </div>
        <div>
          <strong>{duplicates}</strong>条相同 ID
        </div>
      </div>
      <label>
        同 ID 内容、同名活动或设置不同时
        <select value={prefer} onChange={(e) => setPrefer(e.target.value as 'local' | 'incoming')}>
          <option value="local">保留当前版本</option>
          <option value="incoming">使用备份版本</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="small muted">若出现时间重叠，请先在记录页调整对应时间，或修正备份后重试。</p>
      <div className="modal-actions">
        <button
          className="button primary"
          onClick={() => void onImport(prefer).catch((e) => setError(e.message))}
        >
          确认合并
        </button>
      </div>
    </Modal>
  );
}
function ConflictModal({
  local,
  remote,
  onClose,
  onResolve,
}: {
  local: Data;
  remote: Data;
  onClose: () => void;
  onResolve: (d: Data) => Promise<void>;
}) {
  const [choice, setChoice] = useState<'merge' | 'local' | 'remote'>('merge'),
    [error, setError] = useState('');
  return (
    <Modal
      wide
      title="保留哪一份记录？"
      description="两台设备在同步前都进行了修改。先下载两份备份，原始内容就能随时找回。"
      onClose={onClose}
    >
      <div className="conflict-grid">
        {[
          { label: '此设备', data: local },
          { label: '云端', data: remote },
        ].map((v) => (
          <div className="conflict-preview" key={v.label}>
            <h3>{v.label}</h3>
            <p>
              {v.data.entries.length} 段记录 · {v.data.activities.length} 项活动
            </p>
            {v.data.entries
              .slice(-3)
              .reverse()
              .map((e) => (
                <div key={e.id}>
                  <strong>{v.data.activities.find((a) => a.id === e.activityId)?.name}</strong>
                  <small>
                    {formatInTimeZone(e.start, v.data.settings.timezone, 'MM-dd HH:mm')} —{' '}
                    {e.end ? formatInTimeZone(e.end, v.data.settings.timezone, 'HH:mm') : '计时中'}
                  </small>
                  <p>{e.note || '无备注'}</p>
                </div>
              ))}
            <button
              className="text-button"
              onClick={() => DownloadFile(`MengDay-${v.label}.json`, backup(v.data))}
            >
              <Download size={15} />
              下载此版本
            </button>
          </div>
        ))}
      </div>
      <label>
        处理方式
        <select value={choice} onChange={(e) => setChoice(e.target.value as typeof choice)}>
          <option value="merge">合并不同记录，同 ID 保留此设备内容</option>
          <option value="local">使用此设备完整版本（替换云端）</option>
          <option value="remote">使用云端完整版本（替换此设备）</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}。可关闭此面板，在记录页调整本机时间后再合并。
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          稍后处理
        </button>
        <button
          className="button primary"
          onClick={() => {
            try {
              const result =
                choice === 'local'
                  ? local
                  : choice === 'remote'
                    ? remote
                    : mergeData(local, remote, 'local');
              void onResolve(result).catch((e) => setError(e.message));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          应用选择并同步
        </button>
      </div>
    </Modal>
  );
}
