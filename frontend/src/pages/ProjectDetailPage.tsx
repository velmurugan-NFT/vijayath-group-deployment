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
      {tab === 'tasks' && <TabTable title="Tasks" link={`/tasks${q}`} linkLabel="Manage all" headers={['Task', 'Department', 'Status']} rows={(tasks as TaskRow[]).map((t) => [t.title, t.department, <StatusPill key={t.id} status={t.status} />])} delayed={(tasks as TaskRow[]).filter((t) => t.isDelayed).map((t) => t.id)} />}
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
type TaskRow = { id: string; title: string; department: string; status: string; isDelayed: boolean };
type PoRow = { id: string; poNumber: string; totalAmount: number; status: string; vendor?: { name: string } };
type PayRow = { id: string; amount: number; status: string; po?: { poNumber: string } };
type InvRow = { id: string; invoiceNumber: string; amount: number; issuedAt: string };
type DocRow = { id: string; filename: string };
type AuditRow = { id: string; action: string; createdAt: string; user?: { name: string } };

function WbsTable({ wbs, projectId, onRefresh }: { wbs: unknown[]; projectId: string; onRefresh: () => void }) {
  const cats = wbs as WbsCat[];
  const [showForm, setShowForm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ categoryName: '', description: '', estimated: '' });

  const SOLAR_CATEGORIES = [
    'Land', '33KV Transmission Line', 'Substation Work', 'Yard & Civil',
    'Yard Products', 'Panel', 'MMS & Module Erection', 'DC & AC Cabling',
    'Infrastructure', 'Liaisoning', 'Others',
  ];
  const existingCats = cats.map((c) => c.name);
  const categoryOptions = [...new Set([...existingCats, ...SOLAR_CATEGORIES])];

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
          description: form.description,
          estimated: form.estimated ? Math.round(parseFloat(form.estimated)) : 0,
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

  return (
    <div className="space-y-4">
      {/* Empty state — offer to seed defaults */}
      {cats.length === 0 && (
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                This project has no WBS items yet.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={seeding}
                  onClick={seedDefaults}
                >
                  {seeding
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                    : '⚡ Load Solar EPC defaults (11 categories)'
                  }
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add manually
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Solar EPC defaults include: Land · 33KV Line · Substation · Yard &amp; Civil · Panels · MMS · Cabling · Liaisoning · Others
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Add line item form */}
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
                  <option value="">— select or type —</option>
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
                <input
                  type="number"
                  placeholder="0"
                  value={form.estimated}
                  onChange={(e) => setForm({ ...form, estimated: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !form.categoryName || !form.description}
                onClick={addLineItem}
                style={{ whiteSpace: 'nowrap' }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Add</>}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* WBS table */}
      {cats.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="right">Estimated</th>
                  <th className="right">Committed</th>
                  <th className="right">Paid</th>
                  <th className="right">Remaining</th>
                  <th>Burn</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => (
                  <Fragment key={cat.name}>
                    <tr className="group-row"><td colSpan={6}>{cat.name}</td></tr>
                    {cat.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="name-cell" style={{ paddingLeft: 20 }}>
                          {li.description}
                          {li.contributingPOs?.length ? (
                            <div className="secondary">{li.contributingPOs.map((p) => (
                              <Link key={p.poNumber} to={`/pos?projectId=${projectId}`} className="underline mr-2">{p.poNumber}</Link>
                            ))}</div>
                          ) : null}
                        </td>
                        <td className="right amt">{formatINR(li.estimated)}</td>
                        <td className="right amt">{formatINR(li.committed)}</td>
                        <td className="right amt">{formatINR(li.paid)}</td>
                        <td className="right amt">{formatINR(li.estimated - li.paid)}</td>
                        <td style={{ width: 120 }}><BudgetBar est={li.estimated} committed={li.committed} paid={li.paid} /></td>
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
  );
}
