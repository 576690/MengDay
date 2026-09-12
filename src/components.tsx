import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Plus, Search, Leaf } from 'lucide-react';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  colors,
  suggest,
  uid,
  ensureActivity,
  saveEntry,
  type Activity,
  type Data,
  type Entry,
} from './model';
import { ActivityIcon, AppearancePicker } from './activity-appearance';
import { type Appearance } from './appearance';
export { ActivityIcon };
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'modal-wide' : ''}`}
          onOpenAutoFocus={(e) => {
            if (window.innerWidth < 640) e.preventDefault();
          }}
        >
          <div className="modal-handle" />
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? 'muted modal-description' : 'sr-only'}>
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function NameInput({
  data,
  value,
  onChange,
}: {
  data: Data;
  value: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = suggest(data.activities, value).slice(0, 6);
  return (
    <div
      className="name-input"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        if (e.key === 'ArrowDown' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          e.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <div className="input-with-icon">
        <Search size={17} />
        <input
          aria-label="活动名称"
          value={value}
          maxLength={80}
          placeholder="输入或选择活动名称"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <div className="suggestions">
          <small>{value ? '使用过的活动' : '最近使用 · 选择即可复用'}</small>
          {options.map((a) => (
            <button
              type="button"
              key={a.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(a.name);
                setOpen(false);
              }}
            >
              <ActivityIcon activity={a} size={16} />
              <span>{a.name}</span>
              <small>{a.category}</small>
            </button>
          ))}
          {value.trim() &&
            !data.activities.some(
              (a) => a.name.trim().toLowerCase() === value.trim().toLowerCase(),
            ) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(false)}
              >
                <Plus size={17} />
                使用新活动「{value.trim()}」
              </button>
            )}
          {!options.length && !value && <p className="muted">输入名称，之后会自动记住</p>}
        </div>
      )}
    </div>
  );
}
export function EntryForm({
  data,
  entry,
  onSave,
  onClose,
  onDelete,
  initialRange,
  onSaved,
}: {
  data: Data;
  entry?: Entry;
  onSave: (fn: (d: Data) => void) => Promise<void>;
  onClose: () => void;
  onDelete?: (id: string) => void;
  initialRange?: { start: number; end: number };
  onSaved?: () => void;
}) {
  const tz = data.settings.timezone;
  const local = (n: number) => formatInTimeZone(n, tz, "yyyy-MM-dd'T'HH:mm:ss");
  const [name, setName] = useState(
    entry ? (data.activities.find((a) => a.id === entry.activityId)?.name ?? '') : '',
  );
  const [note, setNote] = useState(entry?.note ?? '');
  const [start, setStart] = useState(
    local(entry?.start ?? initialRange?.start ?? Date.now() - 1800000),
  );
  const [end, setEnd] = useState(local(entry?.end ?? initialRange?.end ?? Date.now()));
  const [appearance, setAppearance] = useState<Appearance>();
  const [running, setRunning] = useState(entry?.end === null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={entry ? '编辑记录' : '补记一段时间'}
      description="记录做过的事，也留下一点当时的想法。"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave((d) => {
              const a = ensureActivity(d, name);
              if (appearance) Object.assign(a, appearance);
              saveEntry(d, {
                id: entry?.id ?? uid(),
                activityId: a.id,
                start:
                  (entry?.start ?? initialRange?.start) !== undefined &&
                  start === local((entry?.start ?? initialRange?.start)!)
                    ? (entry?.start ?? initialRange?.start)!
                    : fromZonedTime(start, tz).getTime(),
                end: running
                  ? null
                  : (entry?.end ?? initialRange?.end) !== undefined &&
                      end === local((entry?.end ?? initialRange?.end)!)
                    ? (entry?.end ?? initialRange?.end)!
                    : fromZonedTime(end, tz).getTime(),
                note,
              });
            });
            onSaved?.();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
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
              ) ?? { color: colors[data.activities.length % colors.length], icon: 'Pencil' }
            }
            onChange={setAppearance}
          />
        </details>
        <label>
          备注 <span className="muted">可选</span>
          <textarea
            value={note}
            maxLength={10000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="具体做了什么？有什么新想法？"
            rows={4}
          />
        </label>
        <div className="form-row">
          <label>
            开始时间
            <input
              required
              type="datetime-local"
              step="1"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            结束时间
            <input
              required={!running}
              disabled={running}
              type="datetime-local"
              step="1"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {entry?.end === null && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={running}
              onChange={(e) => setRunning(e.target.checked)}
            />
            保持计时中
          </label>
        )}
        <p className="small muted">时间显示于 {tz}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {entry && onDelete && (
            <button
              type="button"
              className="button danger subtle"
              onClick={() => {
                onDelete(entry.id);
                onClose();
              }}
            >
              删除记录
            </button>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            <Check size={17} />
            保存记录
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ActivityForm({
  activity,
  onSave,
  onClose,
  onDelete,
}: {
  activity: Activity;
  onSave: (a: Activity) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [a, setA] = useState({ ...activity });
  const [error, setError] = useState('');
  return (
    <Modal title="编辑活动" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSave({ ...a, name: a.name.trim(), category: a.category.trim() || '其他' });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          活动名称
          <input
            required
            maxLength={80}
            value={a.name}
            onChange={(e) => setA({ ...a, name: e.target.value })}
          />
        </label>
        <label>
          分类
          <input
            maxLength={80}
            value={a.category}
            onChange={(e) => setA({ ...a, category: e.target.value })}
          />
        </label>
        <AppearancePicker value={a} onChange={(value) => setA({ ...a, ...value })} />
        <div className="form-row">
          <label>
            目标时长（分钟）
            <input
              type="number"
              min="0"
              max="10080"
              value={a.goalMinutes}
              onChange={(e) => setA({ ...a, goalMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            目标周期
            <select
              value={a.goalPeriod}
              onChange={(e) => setA({ ...a, goalPeriod: e.target.value as 'day' | 'week' })}
            >
              <option value="day">每天</option>
              <option value="week">每周</option>
            </select>
          </label>
        </div>
        <p className="muted small">设为 0 表示不设目标。重命名会应用于历史记录。</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {onDelete && (
            <button type="button" className="button danger" onClick={onDelete}>
              删除活动
            </button>
          )}
          <button type="submit" className="button primary">
            保存活动
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Empty({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Leaf size={27} />}</div>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function DownloadFile(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
