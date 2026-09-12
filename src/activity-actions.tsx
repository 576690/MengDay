import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Modal, ActivityIcon } from './components';
import { duration, human, type Activity, type Data } from './model';
import { deleteActivity, type Change } from './timeline-model';
export function ActivityMenu({
  activity,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <div
      ref={ref}
      className="card-actions"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        className="icon-button"
        aria-label={`管理${activity.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="card-menu">
          <button
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil size={15} />
            编辑活动
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={15} />
            删除活动
          </button>
        </div>
      )}
    </div>
  );
}
export function DeleteActivityModal({
  activity,
  data,
  onClose,
  onApply,
}: {
  activity: Activity;
  data: Data;
  onClose: () => void;
  onApply: (change: Change) => Promise<void>;
}) {
  const [all, setAll] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const entries = data.entries.filter((e) => e.activityId === activity.id),
    running = entries.some((e) => e.end === null);
  return (
    <Modal title="删除活动" description="选择是否保留过去的时间记录。" onClose={onClose}>
      <div className="appearance-preview">
        <ActivityIcon activity={activity} />
        <span>
          {activity.name}
          <small>
            {entries.length} 段记录 · {human(entries.reduce((sum, e) => sum + duration(e), 0))}
          </small>
        </span>
      </div>
      <label>
        删除方式
        <select
          value={all ? 'all' : 'keep'}
          onChange={(e) => {
            setAll(e.target.value === 'all');
            setConfirm(false);
          }}
        >
          <option value="keep">保留历史记录，移除活动</option>
          <option value="all">删除活动及全部记录</option>
        </select>
      </label>
      <p className="small muted">
        {all
          ? '活动、目标和关联记录将一起删除，统计会随之更新。'
          : '活动将从今日和名称推荐中移除，历史记录保留，可在设置中恢复。'}
      </p>
      {all && (
        <label className="checkbox-label">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          确认删除「{activity.name}」及其 {entries.length} 段记录
        </label>
      )}
      {running && <p className="error">该活动正在计时，请先结束计时再删除。</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="button primary"
          disabled={busy || running || (all && !confirm)}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(deleteActivity(data, activity.id, all));
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {all ? '删除活动及记录' : '移除活动，保留历史'}
        </button>
      </div>
    </Modal>
  );
}
