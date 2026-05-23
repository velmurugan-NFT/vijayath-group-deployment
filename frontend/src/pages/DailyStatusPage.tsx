import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/FormDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useProjectIdFromUrl } from '@/context/ProjectContext';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

type Status = {
  id: string;
  date: string;
  summary: string;
  project?: { id: string; name: string };
  user?: { name: string };
};
type Project = { id: string; name: string };

// ─── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteStatusModal({
  item,
  onConfirm,
  onCancel,
  deleting,
}: {
  item: Status | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (item) setTyped(''); }, [item]);
  if (!item) return null;

  const confirmWord = 'DELETE';
  const confirmed = typed.trim().toUpperCase() === confirmWord;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '2rem 2rem 1.75rem', maxWidth: 440, width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--line)' }}>
        {/* Icon */}
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', marginBottom: 6 }}>
          Delete this status update?
        </div>

        {/* Warning box */}
        <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>⚠ This cannot be undone</div>
          <div style={{ color: '#7f1d1d' }}>
            You are about to permanently delete the status update from{' '}
            <strong>{formatDate(item.date)}</strong>
            {item.project ? <> for <strong>{item.project.name}</strong></> : ''}.
          </div>
        </div>

        {/* Confirm input */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
            Type <strong style={{ color: 'var(--ink)' }}>{confirmWord}</strong> to confirm:
          </div>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.5rem 0.75rem',
              borderRadius: 7,
              border: typed.length > 0
                ? confirmed ? '1.5px solid var(--success)' : '1.5px solid var(--danger)'
                : '1.5px solid var(--line)',
              fontSize: '0.875rem',
              outline: 'none',
              background: confirmed ? 'var(--success-soft)' : 'var(--surface)',
              transition: 'border-color 0.15s, background 0.15s',
              letterSpacing: '0.05em',
            }}
          />
          {typed.length > 0 && !confirmed && (
            <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: 4 }}>
              Keep typing — must match exactly
            </div>
          )}
          {confirmed && (
            <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginTop: 4 }}>
              ✓ Confirmed
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || deleting}
            onClick={onConfirm}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: confirmed && !deleting ? '#dc2626' : '#f3a9a9',
              color: '#fff',
              transition: 'background 0.15s',
            }}
          >
            {deleting
              ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Deleting…</>
              : <><Trash2 style={{ width: 14, height: 14 }} /> Delete permanently</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DailyStatusPage ───────────────────────────────────────────────────────────
export function DailyStatusPage() {
  const projectId = useProjectIdFromUrl();

  const [items, setItems] = useState<Status[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Create dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    projectId: projectId ?? '',
    date: new Date().toISOString().slice(0, 10),
    summary: '',
  });

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Status | null>(null);
  const [editForm, setEditForm] = useState({ projectId: '', date: '', summary: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Status | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    const q = projectId ? `?projectId=${projectId}` : '';
    api<Status[]>(`/daily-status${q}`).then(setItems);
  };

  useEffect(() => {
    load();
    api<Project[]>('/projects').then(setProjects);
  }, [projectId]);

  // ── Create ────────────────────────────────────────────────────────────────
  const submit = async () => {
    await api('/daily-status', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Daily status submitted');
    setOpen(false);
    load();
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (item: Status) => {
    setEditTarget(item);
    setEditForm({
      projectId: item.project?.id ?? '',
      date: item.date.slice(0, 10),
      summary: item.summary,
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.summary.trim()) { toast.error('Summary is required'); return; }
    setEditSaving(true);
    try {
      await api(`/daily-status/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          date: editForm.date,
          summary: editForm.summary,
          projectId: editForm.projectId || undefined,
        }),
      });
      toast.success('Status updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/daily-status/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Status deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Delete confirmation modal */}
      <DeleteStatusModal
        item={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />

      {/* Edit dialog */}
      {editTarget && (
        <FormDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          title="Edit daily status"
          onSubmit={saveEdit}
        >
          <div>
            <Label>Project</Label>
            <select
              className="w-full border rounded px-3 py-2 mt-1"
              value={editForm.projectId}
              onChange={(e) => setEditForm({ ...editForm, projectId: e.target.value })}
            >
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
            />
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea
              rows={4}
              value={editForm.summary}
              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
            />
          </div>
        </FormDialog>
      )}

      <PageHeader
        title="Daily status"
        subtitle="Site progress updates"
        actions={
          <Button onClick={() => {
            setForm((f) => ({ ...f, projectId: projectId ?? f.projectId }));
            setOpen(true);
          }}>
            Submit status
          </Button>
        }
      />

      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.id} className="card card-pad p-4" style={{ position: 'relative' }}>
            {/* Header row: project name + action buttons */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <p className="font-medium text-vijayanth-green" style={{ margin: 0 }}>
                {s.project
                  ? <Link to={`/projects/${s.project.id}`} className="underline">{s.project.name}</Link>
                  : '—'}
              </p>

              {/* Edit + Delete action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  title="Edit status"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0 8px', color: 'var(--muted)' }}
                  onClick={() => openEdit(s)}
                >
                  <Pencil style={{ width: 13, height: 13 }} />
                </button>
                <button
                  type="button"
                  title="Delete status"
                  className="btn btn-sm"
                  style={{ padding: '0 8px', color: 'var(--danger)', border: '1px solid transparent', background: 'transparent' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(182,52,42,.25)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  }}
                  onClick={() => setDeleteTarget(s)}
                >
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>

            {/* Date + user */}
            <p className="text-xs text-gray-500" style={{ marginTop: 2 }}>
              {formatDate(s.date)}{s.user?.name ? ` — ${s.user.name}` : ''}
            </p>

            {/* Summary */}
            <p className="text-sm mt-2">{s.summary}</p>
          </li>
        ))}

        {items.length === 0 && (
          <li style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            No status updates yet.
          </li>
        )}
      </ul>

      {/* Create dialog */}
      <FormDialog open={open} onOpenChange={setOpen} title="Submit daily status" onSubmit={submit}>
        <div>
          <Label>Project</Label>
          <select
            className="w-full border rounded px-3 py-2 mt-1"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">Select project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
      </FormDialog>
    </div>
  );
}
