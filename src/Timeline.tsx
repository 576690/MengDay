import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Magnet,
  Undo2,
  GripHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { ActivityIcon, EntryForm, Modal } from './components';
import {
  dateKey,
  rangeDays,
  shiftDate,
  shiftMonth,
  human,
  duration,
  type Data,
  type Entry,
} from './model';
import {
  HOUR,
  dayLayout,
  gapsForDay,
  fillGap,
  boundaryLimits,
  snapBoundary,
  moveBoundary,
  createChange,
  applyChange,
  type Boundary,
  type Change,
  type Gap,
} from './timeline-model';
type Props = {
  data: Data;
  now: number;
  date: string;
  setDate: (day: string) => void;
  period: 'day' | 'week' | 'month';
  setPeriod: (period: 'day' | 'week' | 'month') => void;
  onEdit: (entry: Entry) => void;
  onApply: (change: Change) => Promise<void>;
  canUndo: boolean;
  onUndo: () => void;
};
type Drag = {
  boundary: Boundary;
  source: Data;
  initial: number;
  clientY: number;
  lastY: number;
  scrollTop: number;
  dayStart: number;
  dayEnd: number;
  time: number;
  pointerId: number;
  limits: ReturnType<typeof boundaryLimits>;
};
export default function Timeline({
  data,
  now,
  date,
  setDate,
  period,
  setPeriod,
  onEdit,
  onApply,
  canUndo,
  onUndo,
}: Props) {
  const [scale, setScale] = useState(64),
    [editing, setEditing] = useState(false),
    [snap, setSnap] = useState(true),
    [gap, setGap] = useState<Gap | null>(null),
    [insert, setInsert] = useState<Gap | null>(null),
    [shortList, setShortList] = useState<Entry[] | null>(null),
    [precise, setPrecise] = useState<Boundary | null>(null),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<{ change: Change; time: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    frame = useRef<number>(0),
    applyRef = useRef(onApply);
  applyRef.current = onApply;
  const today = dateKey(now, data.settings.timezone),
    days = useMemo(() => rangeDays(date, period), [date, period]);
  const shown = useMemo(() => {
    if (!preview || !drag.current) return data;
    const d = structuredClone(drag.current.source);
    applyChange(d, preview.change);
    return d;
  }, [data, preview]);
  const layoutNow = Math.floor(now / 10000) * 10000;
  const ordered = useMemo(() => [...shown.entries].sort((a, b) => a.start - b.start), [shown]);
  const gaps = useMemo(
    () => days.map((day) => gapsForDay(shown, day, layoutNow)),
    [shown, days, layoutNow],
  );
  const layouts = useMemo(
      () => days.map((day) => dayLayout(shown, day, scale, layoutNow)),
      [shown, days, scale, layoutNow],
    ),
    maxHours = Math.max(...layouts.map((l) => l.hours)),
    height = maxHours * scale,
    hasDST = layouts.some((l) => l.hours !== 24);
  const showError = (e: unknown) => setError(e instanceof Error ? e.message : '操作失败，请重试');
  useEffect(() => {
    setError('');
    const v = viewport.current;
    if (!v) return;
    const index = Math.max(0, days.indexOf(date)),
      layout = dayLayout(data, days[index], scale, now);
    const target =
      days[index] === today ? now : (layout.blocks[0]?.entry.start ?? layout.start + 8 * HOUR);
    v.scrollTop = Math.max(0, ((target - layout.start) / HOUR) * scale - scale);
    const column = v.querySelector<HTMLElement>(`[data-day="${date}"]`);
    if (column) v.scrollLeft = Math.max(0, column.offsetLeft - 56);
  }, [days, scale]);
  useEffect(() => {
    const update = () => {
      const d = drag.current,
        v = viewport.current;
      if (!d || !v) return;
      const raw = d.initial + ((d.lastY - d.clientY + v.scrollTop - d.scrollTop) / scale) * HOUR;
      d.time = snapBoundary(
        raw,
        {
          ...d.limits,
          min: Math.max(d.limits.min, d.dayStart),
          max: Math.min(d.limits.max, d.dayEnd),
        },
        scale,
        snap,
        d.dayStart,
      );
      try {
        setPreview({
          change: moveBoundary(d.source, d.boundary, d.time, Date.now()),
          time: d.time,
        });
      } catch (e) {
        showError(e);
      }
    };
    const tick = () => {
      const d = drag.current,
        v = viewport.current;
      if (!d || !v) return;
      const rect = v.getBoundingClientRect();
      if (d.lastY < rect.top + 80) v.scrollTop -= Math.min(14, (rect.top + 80 - d.lastY) / 3);
      else if (d.lastY > rect.bottom - 48)
        v.scrollTop += Math.min(14, (d.lastY - rect.bottom + 48) / 3);
      update();
      frame.current = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (drag.current && drag.current.pointerId === e.pointerId) {
        e.preventDefault();
        drag.current.lastY = e.clientY;
        update();
      }
    };
    const cancel = () => {
      drag.current = null;
      setPreview(null);
      cancelAnimationFrame(frame.current);
    };
    const finish = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const changed = d.time !== d.initial;
      cancel();
      if (changed) {
        try {
          void applyRef
            .current(moveBoundary(d.source, d.boundary, d.time, Date.now()))
            .catch(showError);
        } catch (e) {
          showError(e);
        }
      }
    };
    const startLoop = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(tick);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('mengday-drag', startLoop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('mengday-drag', startLoop);
      cancelAnimationFrame(frame.current);
    };
  }, [scale, snap]);
  useEffect(
    () => () => {
      drag.current = null;
    },
    [],
  );
  function begin(e: ReactPointerEvent<HTMLButtonElement>, b: Boundary, start: number, end: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = data.entries.find((x) => x.id === b.id)!;
    try {
      const initial = b.edge === 'start' ? entry.start : entry.end!;
      drag.current = {
        boundary: b,
        source: structuredClone(data),
        initial,
        clientY: e.clientY,
        lastY: e.clientY,
        scrollTop: viewport.current!.scrollTop,
        dayStart: start,
        dayEnd: end,
        time: initial,
        pointerId: e.pointerId,
        limits: boundaryLimits(data, b, Date.now()),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      window.dispatchEvent(new Event('mengday-drag'));
    } catch (err) {
      showError(err);
    }
  }
  const handle = (
    b: Boundary,
    start: number,
    end: number,
    position: 'top' | 'bottom' | 'shared',
  ) => (
    <button
      key={`${b.id}-${position}`}
      className={`boundary-handle ${position} ${b.sharedId ? 'shared-edge' : ''}`}
      aria-label={`${b.sharedId ? '共同边界' : b.edge === 'start' ? '调整开始' : '调整结束'} ${data.activities.find((a) => a.id === data.entries.find((e) => e.id === b.id)?.activityId)?.name}`}
      title="拖动调整；双击或按 Enter 精确输入；方向键调整"
      onPointerDown={(e) => begin(e, b, start, end)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setPrecise(b);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setPrecise(b);
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          try {
            const entry = data.entries.find((x) => x.id === b.id)!,
              current = b.edge === 'start' ? entry.start : entry.end!,
              limits = boundaryLimits(data, b, now),
              next = Math.max(
                limits.min,
                Math.min(
                  limits.max,
                  current + (e.key === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 60000 : 300000),
                ),
              );
            void onApply(moveBoundary(data, b, next, now)).catch(showError);
          } catch (err) {
            showError(err);
          }
        }
      }}
    >
      <GripHorizontal size={15} />
    </button>
  );
  const navigate = (direction: number) =>
    setDate(
      period === 'month'
        ? shiftMonth(date, direction)
        : shiftDate(date, direction * (period === 'week' ? 7 : 1)),
    );
  return (
    <section className={`calendar-panel ${editing ? 'editing' : ''}`}>
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="icon-button" aria-label="上一期" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} />
          </button>
          <input
            aria-label="时间轴日期"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
          <button className="icon-button" aria-label="下一期" onClick={() => navigate(1)}>
            <ChevronRight size={18} />
          </button>
          <button className="text-button" onClick={() => setDate(today)}>
            今天
          </button>
        </div>
        <div className="segmented" aria-label="记录视图">
          {(['day', 'week', 'month'] as const).map((p, i) => (
            <button
              key={p}
              aria-pressed={period === p}
              className={period === p ? 'selected' : ''}
              onClick={() => setPeriod(p)}
            >
              {['日', '周', '月'][i]}
            </button>
          ))}
        </div>
        <div className="calendar-controls">
          <select
            aria-label="时间轴缩放"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={40}>紧凑</option>
            <option value={64}>标准</option>
            <option value={96}>放大</option>
          </select>
          <button
            className={`button ${editing ? 'primary' : 'secondary'}`}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            <Pencil size={15} />
            {editing ? '完成编辑' : '编辑模式'}
          </button>
        </div>
      </div>
      {editing && (
        <div className="edit-help">
          <span>点击空白填缝 · 拖动边界调整 · 双击手柄精确输入</span>
          <button
            className={`text-button ${snap ? 'enabled' : ''}`}
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
          >
            <Magnet size={15} />
            {snap ? '吸附已开 · 5 分钟' : '吸附已关'}
          </button>
          <button className="text-button" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={15} />
            撤销上次编辑
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={() => setError('')}>
            关闭
          </button>
        </div>
      )}
      {hasDST && (
        <div className="calendar-dst">
          本期包含夏令时切换，日期列按真实经过时间排列；请以该列标注的当地时间和 UTC 偏移为准。
        </div>
      )}
      <div
        ref={viewport}
        className={`calendar-viewport calendar-${period}`}
        data-testid="calendar-viewport"
      >
        <div
          className="calendar-grid"
          style={
            {
              '--columns': days.length,
              '--hour': `${scale}px`,
              '--calendar-height': `${height}px`,
            } as CSSProperties
          }
        >
          <div className="calendar-corner">{hasDST ? '经过小时' : '时间'}</div>
          {days.map((day, i) => (
            <div key={day} className={`calendar-day-heading ${day === today ? 'is-today' : ''}`}>
              <button
                onClick={() => {
                  setDate(day);
                  setPeriod('day');
                }}
              >
                <small>
                  {
                    ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
                      Number(formatInTimeZone(layouts[i].start, data.settings.timezone, 'i')) % 7
                    ]
                  }
                </small>
                <strong>
                  {Number(day.slice(5, 7))}/{Number(day.slice(-2))}
                </strong>
              </button>
              <span>
                {human(layouts[i].blocks.reduce((s, b) => s + (b.height / scale) * HOUR, 0))}
              </span>
              {layouts[i].hours !== 24 && <em>{layouts[i].hours} 小时日</em>}
            </div>
          ))}
          <div className="calendar-axis" style={{ height }}>
            {Array.from({ length: Math.ceil(maxHours) + 1 }, (_, i) => (
              <span key={i} style={{ top: Math.min(i, maxHours) * scale }}>
                {String(i).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((day, i) => {
            const layout = layouts[i],
              short = layout.blocks.filter((b) => b.height < 24),
              groups: (typeof short)[] = [];
            for (const b of short) {
              const group = groups.at(-1);
              if (group && b.top - (group.at(-1)!.top + group.at(-1)!.height) < 24) group.push(b);
              else groups.push([b]);
            }
            return (
              <div
                key={day}
                className={`calendar-day ${day === today ? 'is-today' : ''}`}
                data-day={day}
                style={{ height }}
              >
                {layout.ticks.map((tick, n) => (
                  <div key={n} className="calendar-hour-line" style={{ top: tick.y }}>
                    {hasDST && (
                      <small>
                        {tick.label} {tick.offset}
                      </small>
                    )}
                  </div>
                ))}
                {editing &&
                  gaps[i].map((g) => (
                    <button
                      key={`${g.start}-${g.end}`}
                      className="calendar-gap"
                      data-testid="timeline-gap"
                      style={{
                        top: ((g.start - layout.start) / HOUR) * scale,
                        height: ((g.end - g.start) / HOUR) * scale,
                      }}
                      aria-label={`填补空白 ${formatInTimeZone(g.start, data.settings.timezone, 'HH:mm')} 至 ${formatInTimeZone(g.end, data.settings.timezone, 'HH:mm')}`}
                      onClick={() => {
                        if (!drag.current) setGap(g);
                      }}
                    >
                      {((g.end - g.start) / HOUR) * scale >= 26 && (
                        <span>
                          <Plus size={13} />
                          {human(g.end - g.start)}
                        </span>
                      )}
                    </button>
                  ))}
                {layout.blocks.map((block) => {
                  const e = block.entry,
                    a = shown.activities.find((a) => a.id === e.activityId)!,
                    index = ordered.findIndex((x) => x.id === e.id),
                    prev = ordered[index - 1],
                    next = ordered[index + 1],
                    sharedStart = prev?.end === e.start,
                    sharedEnd = e.end !== null && next?.start === e.end;
                  return (
                    <div
                      key={e.id}
                      className={`calendar-block ${block.height < 24 ? 'short-block' : ''} ${e.end === null ? 'running-block' : ''}`}
                      data-entry-id={e.id}
                      data-testid="timeline-block"
                      style={
                        {
                          top: block.top,
                          height: block.height,
                          '--activity': a.color,
                        } as CSSProperties
                      }
                    >
                      <button
                        className="calendar-block-content"
                        aria-label={`${a.name} ${formatInTimeZone(e.start, data.settings.timezone, 'HH:mm')} ${e.end ? formatInTimeZone(e.end, data.settings.timezone, 'HH:mm') : '计时中'}`}
                        onClick={() => onEdit(data.entries.find((x) => x.id === e.id) ?? e)}
                      >
                        <strong>
                          {block.continuesBefore ? '↳ ' : ''}
                          {a.name}
                        </strong>
                        {a.icon !== 'None' && <ActivityIcon activity={a} size={14} />}
                        <span>
                          {formatInTimeZone(e.start, data.settings.timezone, 'HH:mm')}–
                          {e.end
                            ? formatInTimeZone(e.end, data.settings.timezone, 'HH:mm')
                            : '现在'}
                        </span>
                        {block.height >= 66 && e.note && <p>{e.note}</p>}
                        {block.height >= 42 && (
                          <small>
                            {human(duration(e, -Infinity, Infinity, now))}
                            {block.continuesAfter ? ' · 跨日 →' : ''}
                          </small>
                        )}
                      </button>
                      {editing &&
                        !block.continuesBefore &&
                        !sharedStart &&
                        handle({ id: e.id, edge: 'start' }, layout.start, layout.end, 'top')}
                      {editing &&
                        e.end !== null &&
                        !block.continuesAfter &&
                        !sharedEnd &&
                        handle(
                          { id: e.id, edge: 'end', sharedId: sharedEnd ? next.id : undefined },
                          layout.start,
                          layout.end,
                          sharedEnd ? 'shared' : 'bottom',
                        )}
                    </div>
                  );
                })}
                {editing &&
                  ordered.map((entry, index) => {
                    const next = ordered[index + 1];
                    return entry.end !== null &&
                      next?.start === entry.end &&
                      entry.end >= layout.start &&
                      entry.end <= layout.end ? (
                      <div
                        key={`shared-${entry.id}`}
                        className="shared-boundary-layer"
                        style={{ top: ((entry.end - layout.start) / HOUR) * scale }}
                      >
                        {handle(
                          { id: entry.id, edge: 'end', sharedId: next.id },
                          layout.start,
                          layout.end,
                          'shared',
                        )}
                      </div>
                    ) : null;
                  })}
                {groups.map((group, n) => (
                  <button
                    key={n}
                    className="short-record-picker"
                    style={{ top: Math.max(0, Math.min(layout.height - 24, group[0].top - 5)) }}
                    aria-label={`查看短记录 ${group.length} 条`}
                    onClick={() =>
                      setShortList(
                        group.map((b) => data.entries.find((e) => e.id === b.entry.id) ?? b.entry),
                      )
                    }
                  >
                    {group.length > 1 ? `${group.length} 条` : '⋯'}
                  </button>
                ))}
                {now >= layout.start && now < layout.end && (
                  <div
                    className="calendar-now"
                    style={{ top: ((now - layout.start) / HOUR) * scale }}
                  >
                    <i />
                    <span>{formatInTimeZone(now, data.settings.timezone, 'HH:mm')}</span>
                  </div>
                )}
                {preview && preview.time >= layout.start && preview.time <= layout.end && (
                  <div
                    className="snap-guide"
                    style={{ top: ((preview.time - layout.start) / HOUR) * scale }}
                  >
                    <span>
                      {formatInTimeZone(preview.time, data.settings.timezone, 'HH:mm:ss')} ·{' '}
                      {human(
                        duration(
                          shown.entries.find((e) => e.id === drag.current?.boundary.id)!,
                          -Infinity,
                          Infinity,
                          now,
                        ),
                      )}
                    </span>
                  </div>
                )}
                {layout.height < height && (
                  <div
                    className="calendar-day-ended"
                    style={{ top: layout.height, height: height - layout.height }}
                  >
                    当日结束
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-footer">
        <span>
          {days[0]}
          {period !== 'day' ? ` — ${days.at(-1)}` : ''} · {data.settings.timezone}
        </span>
        <span>{period === 'day' ? '从早到晚，留住每一段时间' : '左右滚动查看日期'}</span>
      </div>
      {gap && (
        <Modal
          title="填补这段空白"
          description={`${formatInTimeZone(gap.start, data.settings.timezone, 'MM-dd HH:mm:ss')} — ${formatInTimeZone(gap.end, data.settings.timezone, 'MM-dd HH:mm:ss')} · ${human(gap.end - gap.start)}`}
          onClose={() => setGap(null)}
        >
          <div className="gap-options">
            <button
              className="button primary"
              onClick={() => {
                setInsert(gap);
                setGap(null);
              }}
            >
              <Plus size={17} />
              插入一项活动
            </button>
            {gap.before && (
              <button
                className="button secondary"
                onClick={() => {
                  try {
                    void onApply(fillGap(data, gap, 'before'))
                      .then(() => setGap(null))
                      .catch(showError);
                  } catch (e) {
                    showError(e);
                  }
                }}
              >
                <ArrowDownToLine size={17} />
                延长前项：{data.activities.find((a) => a.id === gap.before!.activityId)?.name}
              </button>
            )}
            {gap.after && (
              <button
                className="button secondary"
                onClick={() => {
                  try {
                    void onApply(fillGap(data, gap, 'after'))
                      .then(() => setGap(null))
                      .catch(showError);
                  } catch (e) {
                    showError(e);
                  }
                }}
              >
                <ArrowUpToLine size={17} />
                提前后项：{data.activities.find((a) => a.id === gap.after!.activityId)?.name}
              </button>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {insert && (
        <EntryForm
          data={data}
          initialRange={insert}
          onClose={() => setInsert(null)}
          onSave={(edit) => onApply(createChange(data, '已插入活动', edit))}
        />
      )}
      {shortList && (
        <Modal
          title="短时间记录"
          description="色块保持真实时长；在这里选择要查看或编辑的记录。"
          onClose={() => setShortList(null)}
        >
          <div className="short-record-list">
            {shortList.map((e) => {
              const a = data.activities.find((a) => a.id === e.activityId)!;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    setShortList(null);
                    onEdit(e);
                  }}
                >
                  <ActivityIcon activity={a} />
                  <span>
                    <strong>{a.name}</strong>
                    <small>
                      {formatInTimeZone(e.start, data.settings.timezone, 'HH:mm:ss')} ·{' '}
                      {human(duration(e))}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {precise && (
        <BoundaryForm
          data={data}
          boundary={precise}
          now={now}
          onClose={() => setPrecise(null)}
          onApply={onApply}
        />
      )}
    </section>
  );
}
function BoundaryForm({
  data,
  boundary,
  now,
  onClose,
  onApply,
}: {
  data: Data;
  boundary: Boundary;
  now: number;
  onClose: () => void;
  onApply: (change: Change) => Promise<void>;
}) {
  const entry = data.entries.find((e) => e.id === boundary.id)!;
  const [value, setValue] = useState(
      formatInTimeZone(
        boundary.edge === 'start' ? entry.start : entry.end!,
        data.settings.timezone,
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      ),
    ),
    [error, setError] = useState('');
  return (
    <Modal
      title={boundary.sharedId ? '调整共同边界' : '精确调整边界'}
      description="时间包含时区偏移，夏令时重复小时也可精确指定。方向键每次调整 5 分钟，Shift + 方向键调整 1 分钟。"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const time = Date.parse(value);
            if (!Number.isFinite(time)) throw Error('请输入有效的带时区时间');
            await onApply(moveBoundary(data, boundary, time, now));
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          边界时间（含时区）
          <input required value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button primary" type="submit">
            保存边界
          </button>
        </div>
      </form>
    </Modal>
  );
}
