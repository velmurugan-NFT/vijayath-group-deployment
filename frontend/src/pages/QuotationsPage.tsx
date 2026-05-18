import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { useProjectIdFromUrl } from '@/context/ProjectContext';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

export function QuotationsPage() {
  const urlProjectId = useProjectIdFromUrl();
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [requests, setRequests] = useState<Record<string, unknown>[]>([]);
  const [step, setStep] = useState(0);
  const [qrId, setQrId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [form, setForm] = useState({ projectId: '', lineItemId: '', title: 'PV Modules (1 MW full order)', solexAmt: 1856400, saatvikAmt: 1920000 });

  const load = () => api<Record<string, unknown>[]>('/quotations').then(setRequests);
  useEffect(() => {
    api<{ id: string; name: string; parentId: string | null }[]>('/projects').then((p) => {
      const sub = urlProjectId ? p.find((x) => x.id === urlProjectId) : p.find((x) => x.name.includes('1 MW'));
      if (sub) setForm((f) => ({ ...f, projectId: sub.id }));
    });
    api<{ id: string; name: string }[]>('/vendors').then(setVendors);
    load();
  }, []);

  useEffect(() => {
    if (form.projectId) api<{ lineItems: { id: string; description: string }[] }[]>(`/projects/${form.projectId}/wbs`).then((wbs) => {
      const panel = wbs.flatMap((c) => c.lineItems).find((l) => l.description.includes('PV Module'));
      if (panel) setForm((f) => ({ ...f, lineItemId: panel.id }));
    });
  }, [form.projectId]);

  const createRequest = async () => {
    const qr = await api<{ id: string }>('/quotations', { method: 'POST', body: JSON.stringify(form) });
    setQrId(qr.id);
    const solex = vendors.find((v) => v.name.includes('Solex'));
    const saatvik = vendors.find((v) => v.name.includes('Saatvik'));
    if (solex) await api(`/quotations/${qr.id}/quotes`, { method: 'POST', body: JSON.stringify({ vendorId: solex.id, amount: form.solexAmt, deliveryDays: 45 }) });
    if (saatvik) await api(`/quotations/${qr.id}/quotes`, { method: 'POST', body: JSON.stringify({ vendorId: saatvik.id, amount: form.saatvikAmt, deliveryDays: 50 }) });
    setStep(2);
    load();
    toast.success('Quotes captured');
  };

  const selectWinner = async () => {
    const res = await api<{ purchaseOrder: { id: string; poNumber: string } }>(`/quotations/${qrId}/select-winner`, {
      method: 'POST', body: JSON.stringify({ quotationId: winnerId, reason: 'Preferred vendor relationship' }),
    });
    await api(`/pos/${res.purchaseOrder.id}/submit`, { method: 'POST' });
    toast.success(`PO ${res.purchaseOrder.poNumber} submitted for approval`);
    setStep(0);
    setWinnerId('');
    load();
  };

  const current = requests.find((r) => r.id === qrId) as { quotations?: { id: string; amount: number; vendor: { name: string } }[] } | undefined;
  const quotes = current?.quotations ?? [];

  return (
    <div>
      <PageHeader title="POs & Quotes" subtitle="Quotation → comparison → PO approval workflow" actions={<Link to="/approvals" className="btn btn-ghost">Approvals queue</Link>} />

      <Card className="mb-6">
        <CardHeader title="New quotation request" subtitle={`Step ${step + 1} of 3`} />
        <CardBody>
          {step === 0 && (
            <div className="space-y-3 max-w-lg">
              <div className="field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="field"><label>Solex amount (₹)</label><input type="number" value={form.solexAmt} onChange={(e) => setForm({ ...form, solexAmt: +e.target.value })} /></div>
                <div className="field"><label>Saatvik amount (₹)</label><input type="number" value={form.saatvikAmt} onChange={(e) => setForm({ ...form, saatvikAmt: +e.target.value })} /></div>
              </div>
              <button type="button" className="btn btn-primary" onClick={createRequest}><Plus className="w-3.5 h-3.5" /> Create & capture quotes</button>
            </div>
          )}
          {step === 2 && quotes.length > 0 && (
            <>
              <div className="compare-grid mb-4" style={{ gridTemplateColumns: `200px repeat(${quotes.length}, 1fr)` }}>
                <div className="cell l-cell">Vendor</div>
                {quotes.map((q) => (
                  <div key={q.id} className={cn('cell h-cell', winnerId === q.id && 'winner')}>{q.vendor.name}</div>
                ))}
                <div className="cell l-cell">Total (incl. GST)</div>
                {quotes.map((q) => (
                  <div key={q.id} className={cn('cell amt', winnerId === q.id && 'winner')}>{formatINR(q.amount)}</div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {quotes.map((q) => (
                  <button key={q.id} type="button" className={cn('btn', winnerId === q.id ? 'btn-gold' : 'btn-ghost')} onClick={() => setWinnerId(q.id)}>
                    Select {q.vendor.name.split(' ')[0]}
                  </button>
                ))}
                <button type="button" className="btn btn-primary ml-auto" disabled={!winnerId} onClick={selectWinner}>Submit PO for approval</button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="All quotation requests" />
        <CardBody className="p-0">
          <table className="tbl">
            <thead><tr><th>Title</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={String(r.id)}>
                  <td className="name-cell">{String(r.title)}</td>
                  <td><StatusBadge status={String(r.status)} /></td>
                  <td className="right"><Link to="/pos" className="btn btn-link btn-sm">View POs</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
