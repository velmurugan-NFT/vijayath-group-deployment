import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { KpiCard } from '@/components/KpiCard';
import { BudgetBar } from '@/components/design/BudgetBar';
import { FormDialog } from '@/components/FormDialog';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { useProjectContext } from '@/context/ProjectContext';

type Rec = {
  projectId: string;
  name: string;
  billable: number;
  received: number;
  balance: number;
  pctCollected: number;
  ageing: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
};

type InvoiceOption = { id: string; invoiceNumber: string; amount: number };

type Receipt = {
  id: string;
  amount: number;
  receivedAt: string;
  reference?: string;
  mode?: string;
  project?: { id: string; name: string };
  invoiceLinks?: { invoice: { id: string; invoiceNumber: string } }[];
};

const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'Cash', 'Other'] as const;

export function ReceivablesPage() {
  const [data, setData] = useState<Rec[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const { activeProject } = useProjectContext();
  const [projects, setProjects] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [projectInvoices, setProjectInvoices] = useState<InvoiceOption[]>([]);

  const [form, setForm] = useState({
    projectId: '',
    invoiceId: '',
    amount: 0,
    receivedAt: new Date().toISOString().slice(0, 10),
    reference: '',
    mode: 'NEFT',
  });

  const scopedProjectIds = activeProject
    ? new Set([
        activeProject.id,
        ...projects.filter((p) => p.parentId === activeProject.id).map((p) => p.id),
      ])
    : null;

  const filteredProjects = activeProject
    ? projects.filter(
        (p) => p.id === activeProject.id || p.parentId === activeProject.id,
      )
    : projects;

  const filteredData = scopedProjectIds
    ? data.filter((r) => scopedProjectIds.has(r.projectId))
    : data;

  const filteredReceipts = scopedProjectIds
    ? receipts.filter((r) => r.project?.id && scopedProjectIds.has(r.project.id))
    : receipts;

  const totalBillable = filteredData.reduce((s, r) => s + r.billable, 0);
  const totalCollected = filteredData.reduce((s, r) => s + r.received, 0);
  const over60 = filteredData.reduce(
    (s, r) => s + r.ageing.d61_90 + r.ageing.d90plus,
    0,
  );

  const load = () => {
    api<Rec[]>('/receipts/receivables').then(setData).catch(() => {});
    api<Receipt[]>('/receipts').then(setReceipts).catch(() => {});
    api<{ id: string; name: string; parentId: string | null }[]>('/projects')
      .then(setProjects)
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.projectId) {
      setProjectInvoices([]);
      return;
    }
    api<InvoiceOption[]>(
      `/invoices?projectId=${form.projectId}&availableForReceipt=true`,
    )
      .then(setProjectInvoices)
      .catch(() => setProjectInvoices([]));
  }, [form.projectId]);

  const selectInvoice = (invoiceId: string) => {
    const inv = projectInvoices.find((i) => i.id === invoiceId);
    setForm((f) => ({
      ...f,
      invoiceId,
      amount: inv ? Number(inv.amount) : 0,
    }));
  };

  const record = async () => {
    if (!form.projectId) { toast.error('Select a project'); return; }
    if (!form.invoiceId) { toast.error('Select an invoice'); return; }
    try {
      await api('/receipts', {
        method: 'POST',
        body: JSON.stringify({
          projectId: form.projectId,
          invoiceId: form.invoiceId,
          amount: form.amount,
          receivedAt: form.receivedAt,
          reference: form.reference || undefined,
          mode: form.mode,
        }),
      });
      toast.success('Receipt recorded');
      setOpen(false);
      setForm({
        projectId: '',
        invoiceId: '',
        amount: 0,
        receivedAt: new Date().toISOString().slice(0, 10),
        reference: '',
        mode: 'NEFT',
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record receipt');
    }
  };

  const openRecordDialog = () => {
    const defaultProjectId = filteredProjects[0]?.id ?? '';
    setForm({
      projectId: defaultProjectId,
      invoiceId: '',
      amount: 0,
      receivedAt: new Date().toISOString().slice(0, 10),
      reference: '',
      mode: 'NEFT',
    });
    setOpen(true);
  };

  const amountLocked = Boolean(form.invoiceId);

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle={`Ageing buckets across ${filteredData.length} project${filteredData.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <button type="button" className="btn btn-ghost">
              <Download className="w-3.5 h-3.5" /> Export Excel
            </button>
            <button type="button" className="btn btn-primary" onClick={openRecordDialog}>
              Record Receipt
            </button>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiCard label="Total billable" value={formatINR(totalBillable)} accent />
        <KpiCard
          label="Collected"
          value={formatINR(totalCollected)}
          sub={`${totalBillable ? ((totalCollected / totalBillable) * 100).toFixed(1) : 0}% of billable`}
          variant="success"
        />
        <KpiCard label="Outstanding > 60 days" value={formatINR(over60)} variant="warning" />
      </div>

      <Card className="mb-6">
        <CardHeader title="Receivables" subtitle="Projects in your scope" />
        <CardBody className="p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th className="right">Billable</th>
                <th className="right">Received</th>
                <th className="right">Balance</th>
                <th className="right">0–30 d</th>
                <th className="right">31–60 d</th>
                <th className="right">61–90 d</th>
                <th className="right text-vijayanth-danger">&gt; 90 d</th>
                <th>Collected</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((r) => (
                <tr key={r.projectId}>
                  <td className="name-cell">
                    <Link to={`/projects/${r.projectId}`} className="underline">{r.name}</Link>
                  </td>
                  <td className="right amt">{formatINR(r.billable)}</td>
                  <td className="right amt text-vijayanth-success font-semibold">{formatINR(r.received)}</td>
                  <td className="right amt"><strong>{formatINR(r.balance)}</strong></td>
                  <td className="right amt">{r.ageing.d0_30 ? formatINR(r.ageing.d0_30) : '—'}</td>
                  <td className="right amt">{r.ageing.d31_60 ? formatINR(r.ageing.d31_60) : '—'}</td>
                  <td className="right amt text-vijayanth-warning">{r.ageing.d61_90 ? formatINR(r.ageing.d61_90) : '—'}</td>
                  <td className="right amt text-vijayanth-danger">{r.ageing.d90plus ? formatINR(r.ageing.d90plus) : '—'}</td>
                  <td style={{ width: 180 }}>
                    <BudgetBar est={r.billable} committed={0} paid={r.received} />
                    <div className="secondary mt-1">{r.pctCollected}%</div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                    No receivables data found. Make sure your projects have a billable amount set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Receipts" />
        <CardBody className="p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Invoices</th>
                <th>Mode</th>
                <th>Reference</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.receivedAt)}</td>
                  <td>{r.project?.name ?? '—'}</td>
                  <td>
                    {r.invoiceLinks?.length ? (
                      r.invoiceLinks.map((l) => l.invoice.invoiceNumber).join(', ')
                    ) : (
                      <span className="text-vijayanth-muted">—</span>
                    )}
                  </td>
                  <td>{r.mode ?? '—'}</td>
                  <td>
                    <code className="mono text-vijayanth-muted text-[11px]">{r.reference ?? '—'}</code>
                  </td>
                  <td className="right amt"><strong>{formatINR(r.amount)}</strong></td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>
                    No receipts recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <FormDialog open={open} onOpenChange={setOpen} title="Record receipt" onSubmit={record}>
        <div className="field">
          <label>Project</label>
          <select
            value={form.projectId}
            onChange={(e) =>
              setForm({
                ...form,
                projectId: e.target.value,
                invoiceId: '',
                amount: 0,
              })
            }
          >
            <option value="">— select project —</option>
            {filteredProjects.filter((p) => !p.parentId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {filteredProjects.some((p) => p.parentId) && (
              <optgroup label="Sub-projects">
                {filteredProjects.filter((p) => p.parentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {form.projectId && (
          <div className="field">
            <label>Select Invoice</label>
            {projectInvoices.length === 0 ? (
              <p className="text-sm text-vijayanth-muted">
                No open invoices for this project. Invoices with an existing receipt are not listed.{' '}
                <Link to="/invoices" className="underline">Generate an invoice</Link> first.
              </p>
            ) : (
              <select
                value={form.invoiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) setForm((f) => ({ ...f, invoiceId: '', amount: 0 }));
                  else selectInvoice(id);
                }}
              >
                <option value="">— select invoice —</option>
                {projectInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {formatINR(inv.amount)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="field">
          <label>Amount (₹)</label>
          <input
            type="number"
            value={form.amount || ''}
            readOnly={amountLocked}
            disabled={!amountLocked}
            className={amountLocked ? 'bg-gray-100 cursor-not-allowed' : undefined}
            onChange={(e) => {
              if (!amountLocked) setForm({ ...form, amount: Number(e.target.value) });
            }}
          />
        </div>
        <div className="field">
          <label>Received date</label>
          <input
            type="date"
            value={form.receivedAt}
            onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Payment mode</label>
          <select
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value })}
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reference / UTR</label>
          <input
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </div>
      </FormDialog>
    </div>
  );
}
