import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api, apiUpload } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { ContextBanner } from '@/components/design/ContextBanner';
import { AppTabs, AppTab } from '@/components/design/AppTabs';
import { StatusPill } from '@/components/design/StatusPill';
import { BudgetBar } from '@/components/design/BudgetBar';
import { Folder, Plus, Receipt, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Counts = { tasks: number; pos: number; payments: number; invoices: number; documents: number; audit: number };

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get('tab') || 'overview';
  const [project, setProject] = useState<Record<string, unknown> & { _counts?: Counts } | null>(null);
  const [wbs, setWbs] = useState<unknown[]>([]);
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [pos, setPos] = useState<unknown[]>([]);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [docs, setDocs] = useState<unknown[]>([]);
  const [audit, setAudit] = useState<unknown[]>([]);

  const setTab = (t: string) => setSearchParams({ tab: t });

  const load = () => {
    if (!id) return;
    api<Record<string, unknown> & { _counts?: Counts }>(`/projects/${id}`).then(setProject);
    api(`/projects/${id}/wbs`).then(setWbs);
    api(`/tasks?projectId=${id}`).then(setTasks);
    api(`/pos?projectId=${id}`).then(setPos);
    api(`/payments?projectId=${id}`).then(setPayments);
    api(`/invoices?projectId=${id}`).then(setInvoices);
    api(`/documents?projectId=${id}`).then(setDocs);
    api(`/audit?projectId=${id}`).then(setAudit);
  };

  useEffect(() => { load(); }, [id]);

  if (!project) return <div className="animate-pulse h-48 bg-vijayanth-green-50 rounded-brand" />;

  const q = id ? `?projectId=${id}` : '';
  const c = project._counts;

  return (
    <div>
      <ContextBanner>
        <Folder className="w-3.5 h-3.5" />
        <span className="lbl">Project context</span>
        <span className="val">{String(project.name)}</span>
        <StatusPill status={String(project.status)} />
        <button type="button" className="btn btn-link btn-sm ml-auto" onClick={() => navigate('/projects')}>← All projects</button>
      </ContextBanner>

      <PageHeader
        title={String(project.name)}
        subtitle={`${project.client ?? 'VCPPL'} · ${project.capacityMw ?? '—'} MW`}
        actions={
          <>
            <Link to={`/quotations${q}`} className="btn btn-ghost"><Plus className="w-3.5 h-3.5" /> New quote</Link>
            <Link to={`/invoices${q}`} className="btn btn-primary"><Receipt className="w-3.5 h-3.5" /> Generate invoice</Link>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiCard label="Billable" value={formatINR(project.billable as number)} accent />
        <KpiCard label="Net cost" value={formatINR(project.netCost as number)} />
        <KpiCard label="Profit" value={formatINR(project.profit as number)} variant="success" />
        <KpiCard label="Received" value={formatINR((project.customerReceipts as { amount: number }[] | undefined)?.reduce((s, r) => s + r.amount, 0) ?? 0)} />
      </div>

      <AppTabs>
        <AppTab active={tab === 'overview'} onClick={() => setTab('overview')} label="Overview" />
        <AppTab active={tab === 'wbs'} onClick={() => setTab('wbs')} label="Budget / WBS" />
        <AppTab active={tab === 'tasks'} onClick={() => setTab('tasks')} label="Tasks" count={c?.tasks} />
        <AppTab active={tab === 'pos'} onClick={() => setTab('pos')} label="Purchase orders" count={c?.pos} />
        <AppTab active={tab === 'payments'} onClick={() => setTab('payments')} label="Payments" count={c?.payments} />
        <AppTab active={tab === 'invoices'} onClick={() => setTab('invoices')} label="Invoices" count={c?.invoices} />
        <AppTab active={tab === 'documents'} onClick={() => setTab('documents')} label="Documents" count={c?.documents} />
        <AppTab active={tab === 'activity'} onClick={() => setTab('activity')} label="Activity" count={c?.audit} />
      </AppTabs>

      {tab === 'overview' && (
        <div className="resp-2-1">
          <Card>
            <CardHeader title="Lifecycle" actions={<StatusPill status={String(project.status)} />} />
            <CardBody>
              <div className="flex items-center gap-0">
                {['Draft', 'Confirmed', 'In Execution', 'Commissioning', 'O&M', 'Closed'].map((p, i) => (
                  <Fragment key={p}>
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${i <= 2 ? 'bg-vijayanth-green text-white' : i === 3 ? 'bg-vijayanth-gold text-vijayanth-green-deep' : 'bg-vijayanth-surface-2 text-vijayanth-muted border border-vijayanth-line'}`}>{i + 1}</div>
                      <span className="text-[10px] text-vijayanth-muted text-center">{p}</span>
                    </div>
                    {i < 5 && <div className="h-px flex-1 bg-vijayanth-line -mt-4" />}
                  </Fragment>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Quick facts" />
            <CardBody className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="muted">Client</span><span className="font-medium">{String(project.client ?? '—')}</span></div>
              <div className="flex justify-between"><span className="muted">Status</span><StatusPill status={String(project.status)} /></div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'wbs' && <WbsTable wbs={wbs} projectId={id!} onRefresh={() => api(`/projects/${id}/wbs`).then(setWbs)} />}
      {tab === 'tasks' && (
        <TasksTab
          tasks={tasks as TaskRow[]}
          projectId={id!}
          onRefresh={() => api(`/tasks?projectId=${id}`).then(setTasks)}
        />
      )}
      {tab === 'pos' && <TabTable title="Purchase orders" link={`/quotations${q}`} headers={['PO #', 'Vendor', 'Amount', 'Status']} rows={(pos as PoRow[]).map((p) => [<Link key={p.id} to={`/pos/${p.id}`} className="underline">{p.poNumber}</Link>, p.vendor?.name ?? '—', formatINR(p.totalAmount), <StatusPill key={p.id} status={p.status} />])} />}
      {tab === 'payments' && <TabTable title="Payments" link={`/payments${q}`} headers={['PO', 'Amount', 'Status']} rows={(payments as PayRow[]).map((p) => [p.po?.poNumber, formatINR(p.amount), <StatusPill key={p.id} status={p.status} />])} />}
      {tab === 'invoices' && <TabTable title="Customer invoices" link={`/invoices${q}`} headers={['#', 'Amount', 'Date']} rows={(invoices as InvRow[]).map((i) => [i.invoiceNumber, formatINR(i.amount), formatDate(i.issuedAt)])} />}
      {tab === 'documents' && (
        <Card>
          <CardHeader title="Documents" />
          <CardBody>
            <input type="file" className="mb-4 text-sm" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !id) return;
              const fd = new FormData();
              fd.append('file', f);
              fd.append('projectId', id);
              fd.append('category', 'General');
              await apiUpload('/documents', fd);
              load();
            }} />
            <ul className="text-sm space-y-2">{(docs as DocRow[]).map((d) => (
              <li key={d.id}><a href={`/api/documents/${d.id}/download`} className="btn btn-link btn-sm">{d.filename}</a></li>
            ))}</ul>
          </CardBody>
        </Card>
      )}
      {tab === 'activity' && (
        <Card>
          <CardHeader title="Audit trail" />
          <CardBody className="space-y-2 text-sm">
            {(audit as AuditRow[]).map((a) => (
              <p key={a.id} className="text-vijayanth-ink-2">{formatDate(a.createdAt)} — <strong>{a.user?.name}</strong> — {a.action}</p>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function TabTable({ title, link, linkLabel = 'Open', headers, rows, delayed }: { title: string; link: string; linkLabel?: string; headers: string[]; rows: ReactNode[][]; delayed?: string[] }) {
  return (
    <Card>
      <CardHeader title={title} actions={<Link to={link} className="btn btn-ghost btn-sm">{linkLabel}</Link>} />
      <CardBody className="p-0">
        <table className="tbl">
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i} className={delayed?.includes(String(row[0])) ? 'delayed' : ''}>{row.map((cell, j) => <td key={j} className={j > 0 && typeof cell === 'string' && cell.includes('₹') ? 'right amt' : ''}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </CardBody>
    </Card>
  );
}

type WbsCat = { name: string; lineItems: { id: string; description: string; estimated: number; committed: number; paid: number; contributingPOs?: { poNumber: string }[] }[] };
type TaskRow = {
  id: string; title: string; department: string; status: string;
  isDelayed: boolean; remarks?: string | null;
  plannedStart?: string | null; plannedEnd?: string | null;
};
type PoRow = { id: string; poNumber: string; totalAmount: number; status: string; vendor?: { name: string } };
type PayRow = { id: string; amount: number; status: string; po?: { poNumber: string } };
type InvRow = { id: string; invoiceNumber: string; amount: number; issuedAt: string };
type DocRow = { id: string; filename: string };
type AuditRow = { id: string; action: string; createdAt: string; user?: { name: string } };

// ── Edit Task Modal ────────────────────────────────────────────────────────────
const TASK_STATUSES = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED',   label: 'Completed'   },
  { value: 'ON_HOLD',     label: 'On hold'     },
];

function EditTaskModal({
  task, onSave, onCancel, saving,
}: {
  task: TaskRow | null;
  onSave: (values: { status: string; remarks: string; plannedStart: string; plannedEnd: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [status,       setStatus]       = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd,   setPlannedEnd]   = useState('');

  useEffect(() => {
    if (task) {
      setStatus(task.status);
      setRemarks(task.remarks ?? '');
      setPlannedStart(task.plannedStart ? task.plannedStart.slice(0, 10) : '');
      setPlannedEnd(task.plannedEnd     ? task.plannedEnd.slice(0, 10)   : '');
    }
  }, [task?.id]);

  if (!task) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 480, width: '92%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>Edit task</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink)', marginTop: 3, fontWeight: 500 }}>{task.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 1 }}>{task.department}</div>
          </div>
          <button
            type="button" onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status *</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Planned start</label>
              <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Planned end</label>
              <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any update or note about this task…"
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button" className="btn btn-primary"
            disabled={saving || !status}
            onClick={() => onSave({ status, remarks, plannedStart, plannedEnd })}
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : 'Save changes'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Task Modal ─────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  'Civil', 'Electrical', 'Mechanical', 'Procurement',
  'Liaisoning', 'O&M', 'Finance', 'Admin', 'Other',
];

function AddTaskModal({
  open, projectId, onSaved, onCancel,
}: {
  open: boolean;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title,        setTitle]        = useState('');
  const [department,   setDepartment]   = useState('');
  const [status,       setStatus]       = useState('NOT_STARTED');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd,   setPlannedEnd]   = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [saving,       setSaving]       = useState(false);

  // Reset form every time modal opens
  useEffect(() => {
    if (open) {
      setTitle(''); setDepartment(''); setStatus('NOT_STARTED');
      setPlannedStart(''); setPlannedEnd(''); setRemarks('');
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!title.trim())      { toast.error('Title is required'); return; }
    if (!department.trim()) { toast.error('Department is required'); return; }
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title:        title.trim(),
          department:   department.trim(),
          status,
          plannedStart: plannedStart || undefined,
          plannedEnd:   plannedEnd   || undefined,
          remarks:      remarks      || undefined,
        }),
      });
      toast.success('Task added');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 500, width: '92%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>Add task</div>
          <button
            type="button" onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Task title *</label>
            <input
              autoFocus
              placeholder="e.g. Foundation concrete work"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Department *</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">— select —</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Planned start</label>
              <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Planned end</label>
              <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Remarks</label>
            <input
              placeholder="Any notes about this task…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button" className="btn btn-primary"
            disabled={saving || !title.trim() || !department.trim()}
            onClick={handleSave}
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : <><Plus className="w-3.5 h-3.5" /> Add task</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tasks Tab ──────────────────────────────────────────────────────────────────
function TasksTab({ tasks, projectId, onRefresh }: {
  tasks: TaskRow[];
  projectId: string;
  onRefresh: () => void;
}) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTarget, setEditTarget] = useState<TaskRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const handleEditSave = async (values: { status: string; remarks: string; plannedStart: string; plannedEnd: string }) => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await api(`/tasks/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status:       values.status,
          remarks:      values.remarks      || undefined,
          plannedStart: values.plannedStart || undefined,
          plannedEnd:   values.plannedEnd   || undefined,
        }),
      });
      toast.success('Task updated');
      setEditTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setEditSaving(false);
    }
  };

  const iconBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', borderRadius: 5,
    color: 'var(--muted)', cursor: 'pointer', padding: '4px 5px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.12s, color 0.12s',
  };

  return (
    <>
      <AddTaskModal
        open={showAdd}
        projectId={projectId}
        onSaved={() => { setShowAdd(false); onRefresh(); }}
        onCancel={() => setShowAdd(false)}
      />
      <EditTaskModal
        task={editTarget}
        onSave={handleEditSave}
        onCancel={() => setEditTarget(null)}
        saving={editSaving}
      />
      <Card>
        <CardHeader
          title="Tasks"
          subtitle={`${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" /> Add task
            </button>
          }
        />
        <CardBody className="p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Task</th>
                <th>Department</th>
                <th>Planned start</th>
                <th>Planned end</th>
                <th>Remarks</th>
                <th>Status</th>
                <th style={{ width: 48, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className={t.isDelayed ? 'delayed' : ''}>
                  <td className="name-cell" style={{ fontWeight: 600 }}>{t.title}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{t.department}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{formatDate(t.plannedStart)}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{formatDate(t.plannedEnd)}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{t.remarks ?? '—'}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      title="Edit task"
                      onClick={() => setEditTarget(t)}
                      style={iconBtnStyle}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--green)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'none';
                        (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z"
                          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>
                    No tasks yet.{' '}
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ display: 'inline', padding: 0 }}
                      onClick={() => setShowAdd(true)}
                    >
                      Add the first task →
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </>
  );
}

// ── Confirm-delete modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({
  item,
  onConfirm,
  onCancel,
  deleting,
}: {
  item: { id: string; description: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  if (!item) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 420, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#fee2e2', display: 'flex', alignItems: 'center',
          justifyContent: 'center', marginBottom: 14,
        }}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"
              stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6, color: 'var(--ink)' }}>
          Delete WBS line item?
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You are about to permanently delete{' '}
          <strong style={{ color: 'var(--ink)' }}>"{item.description}"</strong>.
          This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 7, padding: '7px 18px', fontWeight: 600,
              fontSize: '0.875rem', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 6,
            }}
          >
            {deleting
              ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Deleting…</>
              : 'Yes, delete it'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
// ── Edit line-item modal ──────────────────────────────────────────────────────
function EditLineItemModal({
  item,
  categoryOptions,
  onSave,
  onCancel,
  saving,
}: {
  item: { id: string; description: string; estimated: number; categoryName: string } | null;
  categoryOptions: string[];
  onSave: (values: { description: string; estimated: number; categoryName: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [desc,      setDesc]      = useState('');
  const [estimated, setEstimated] = useState('');
  const [category,  setCategory]  = useState('');

  // Pre-fill whenever a new item is passed in
  useEffect(() => {
    if (item) {
      setDesc(item.description);
      setEstimated(String(item.estimated));
      setCategory(item.categoryName);
    }
  }, [item?.id]);

  if (!item) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 460, width: '92%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>
            Edit WBS line item
          </div>
          <button
            type="button" onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.2rem', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— select —</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Description *</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. PV Modules supply — 77 kW"
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Estimated amount (₹)</label>
            <input
              type="number"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button" className="btn btn-primary"
            disabled={saving || !desc.trim()}
            onClick={() => onSave({
              description: desc.trim(),
              estimated:   estimated ? Math.round(Number(estimated)) : 0,
              categoryName: category,
            })}
          >
            {saving
              ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Saving…</>
              : 'Save changes'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WbsTable ─────────────────────────────────────────────────────────────────
function WbsTable({ wbs, projectId, onRefresh }: { wbs: unknown[]; projectId: string; onRefresh: () => void }) {
  const cats = wbs as WbsCat[];
  const [showForm, setShowForm] = useState(false);
  const [seeding,  setSeeding]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({ categoryName: '', description: '', estimated: '' });

  // ── Edit modal ────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<{
    id: string; description: string; estimated: number; categoryName: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (li: WbsCat['lineItems'][number], catName: string) => {
    setEditTarget({ id: li.id, description: li.description, estimated: li.estimated, categoryName: catName });
  };

  const saveEdit = async (values: { description: string; estimated: number; categoryName: string }) => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await api(`/projects/${projectId}/wbs/line-items/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description:  values.description,
          estimated:    values.estimated,
          categoryName: values.categoryName || undefined,
        }),
      });
      toast.success('Line item updated');
      setEditTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally { setEditSaving(false); }
  };

  // ── Delete modal ──────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; description: string } | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/projects/${projectId}/wbs/line-items/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(`"${deleteTarget.description}" deleted`);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally { setDeleting(false); }
  };

  // ── Misc ──────────────────────────────────────────────────────────────
  const SOLAR_CATEGORIES = [
    'Land', '33KV Transmission Line', 'Substation Work', 'Yard & Civil',
    'Yard Products', 'Panel', 'MMS & Module Erection', 'DC & AC Cabling',
    'Infrastructure', 'Liaisoning', 'Others',
  ];
  const categoryOptions = [...new Set([...cats.map((c) => c.name), ...SOLAR_CATEGORIES])];

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      await api(`/projects/${projectId}/wbs/seed-defaults`, { method: 'POST' });
      toast.success('Default Solar EPC WBS created — update estimated amounts as needed');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to seed WBS');
    } finally { setSeeding(false); }
  };

  const addLineItem = async () => {
    if (!form.categoryName || !form.description) {
      toast.error('Category and description are required'); return;
    }
    setSaving(true);
    try {
      await api(`/projects/${projectId}/wbs/line-items`, {
        method: 'POST',
        body: JSON.stringify({
          categoryName: form.categoryName,
          description:  form.description,
          estimated:    form.estimated ? Math.round(parseFloat(form.estimated)) : 0,
        }),
      });
      toast.success('Line item added');
      setForm({ categoryName: '', description: '', estimated: '' });
      setShowForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add line item');
    } finally { setSaving(false); }
  };

  const iconBtn = (danger = false): React.CSSProperties => ({
    background: 'none', border: 'none', borderRadius: 5,
    color: danger ? '#ef4444' : 'var(--muted)',
    cursor: 'pointer', padding: '4px 6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.12s, color 0.12s',
  });

  return (
    <>
      {/* ── Edit modal ── */}
      <EditLineItemModal
        item={editTarget}
        categoryOptions={categoryOptions}
        onSave={saveEdit}
        onCancel={() => setEditTarget(null)}
        saving={editSaving}
      />

      {/* ── Delete confirm modal ── */}
      <DeleteConfirmModal
        item={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />

      <div className="space-y-4">
        {/* ── Empty state ── */}
        {cats.length === 0 && (
          <Card>
            <CardBody>
              <div style={{ textAlign: 'center', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>This project has no WBS items yet.</p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary" disabled={seeding} onClick={seedDefaults}>
                    {seeding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : '⚡ Load Solar EPC defaults (11 categories)'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowForm(true)}>
                    <Plus className="w-3.5 h-3.5" /> Add manually
                  </button>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                  Solar EPC defaults include: Land · 33KV Line · Substation · Yard &amp; Civil · Panels · MMS · Cabling · Liaisoning · Others
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Add line item form ── */}
        {(showForm || cats.length > 0) && (
          <Card>
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Add WBS line item</span>
                {cats.length === 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={seedDefaults} disabled={seeding}>
                    {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '⚡ Load Solar EPC defaults'}
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: '0.5rem', alignItems: 'end' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Category *</label>
                  <select value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}>
                    <option value="">— select —</option>
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Description *</label>
                  <input
                    placeholder="e.g. PV Modules supply — 77 kW"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Estimated (₹)</label>
                  <input type="number" placeholder="0" value={form.estimated}
                    onChange={(e) => setForm({ ...form, estimated: e.target.value })} />
                </div>
                <button
                  type="button" className="btn btn-primary btn-sm"
                  disabled={saving || !form.categoryName || !form.description}
                  onClick={addLineItem} style={{ whiteSpace: 'nowrap' }}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Add</>}
                </button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── WBS table ── */}
        {cats.length > 0 && (
          <Card>
            <CardBody className="p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Line item</th>
                    <th className="right">Estimated</th>
                    <th className="right">Committed</th>
                    <th className="right">Paid</th>
                    <th className="right">Remaining</th>
                    <th>Burn</th>
                    <th style={{ width: 72, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((cat) => (
                    <Fragment key={cat.name}>
                      <tr className="group-row"><td colSpan={7}>{cat.name}</td></tr>
                      {cat.lineItems.map((li) => (
                        <tr key={li.id}>
                          {/* Description — plain text, no inline editing */}
                          <td className="name-cell" style={{ paddingLeft: 20 }}>
                            {li.description}
                            {li.contributingPOs?.length ? (
                              <div className="secondary">
                                {li.contributingPOs.map((p) => (
                                  <Link key={p.poNumber} to="/quotations" className="underline mr-2">{p.poNumber}</Link>
                                ))}
                              </div>
                            ) : null}
                          </td>

                          {/* Estimated — plain text, no inline editing */}
                          <td className="right amt">{formatINR(li.estimated)}</td>

                          <td className="right amt">{formatINR(li.committed)}</td>
                          <td className="right amt">{formatINR(li.paid)}</td>
                          <td className="right amt">{formatINR(li.estimated - li.paid)}</td>
                          <td style={{ width: 120 }}>
                            <BudgetBar est={li.estimated} committed={li.committed} paid={li.paid} />
                          </td>

                          {/* Edit + Delete buttons */}
                          <td style={{ width: 72, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {/* Pencil — opens Edit modal */}
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => openEdit(li, cat.name)}
                              style={iconBtn()}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                                (e.currentTarget as HTMLElement).style.color = 'var(--ink)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'none';
                                (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z"
                                  stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                              </svg>
                            </button>

                            {/* Bin — opens Delete confirm modal */}
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => setDeleteTarget({ id: li.id, description: li.description })}
                              style={iconBtn(true)}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = '#fee2e2';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'none';
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"
                                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
