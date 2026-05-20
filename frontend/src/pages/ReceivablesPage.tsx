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

type Rec = {
  projectId: string;
  name: string;
  billable: number;
  received: number;
  balance: number;
  pctCollected: number;
  ageing: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
};

type Receipt = { id: string; amount: number; receivedAt: string; reference?: string; mode?: string; project?: { name: string } };

export function ReceivablesPage() {
  const [data, setData] = useState<Rec[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ projectId: '', amount: 0, receivedAt: new Date().toISOString().slice(0, 10), reference: '' });

  const load = () => {
    api<Rec[]>('/receipts/receivables').then(setData);
    api<Receipt[]>('/receipts').then(setReceipts);
    // Load ALL projects for the "Record receipt" dialog dropdown.
    // Previously the dialog used `data` (the ageing list) which only contains
    // projects that already have invoices/receipts — new or empty projects
    // would be missing. Fetching /projects separately gives the full list.
    api<{ id: string; name: string; parentId: string | null }[]>('/projects')
      .then((all) => setProjects(all))
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const totalBillable = data.reduce((s, r) => s + r.billable, 0);
  const totalCollected = data.reduce((s, r) => s + r.received, 0);
  const over60 = data.reduce((s, r) => s + r.ageing.d61_90 + r.ageing.d90plus, 0);

  const record = async () => {
    await api('/receipts', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Receipt recorded');
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle="Ageing buckets · per BRD FR-9.3"
        actions={
          <>
            <button type="button" className="btn btn-ghost"><Download className="w-3.5 h-3.5" /> Export Excel</button>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Record receipt</button>
          </>
        }
      />
      <div className="kpi-grid">
        <KpiCard label="Total billable" value={formatINR(totalBillable)} accent />
        <KpiCard label="Collected" value={formatINR(totalCollected)} sub={`${totalBillable ? ((totalCollected / totalBillable) * 100).toFixed(1) : 0}% of billable`} variant="success" />
        <KpiCard label="Outstanding > 60 days" value={formatINR(over60)} variant="warning" />
        <KpiCard label="Projects" value={String(data.length)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Receivables ageing" subtitle="Buckets per FR-9.3" />
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
              {data.map((r) => (
                <tr key={r.projectId}>
                  <td className="name-cell"><Link to={`/projects/${r.projectId}`} className="underline">{r.name}</Link></td>
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
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent receipts" />
        <CardBody className="p-0">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Project</th><th>Reference</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {receipts.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.receivedAt)}</td>
                  <td>{r.project?.name}</td>
                  <td><code className="mono text-vijayanth-muted text-[11px]">{r.reference ?? '—'}</code></td>
                  <td className="right amt"><strong>{formatINR(r.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <FormDialog open={open} onOpenChange={setOpen} title="Record receipt" onSubmit={record}>
        <div className="field"><label>Project</label>
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">— select project —</option>
            {projects.filter((p) => !p.parentId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {projects.some((p) => p.parentId) && (
              <optgroup label="Sub-projects">
                {projects.filter((p) => p.parentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="field"><label>Amount (₹)</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
        <div className="field"><label>Received date</label><input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></div>
        <div className="field"><label>Reference / UTR</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
