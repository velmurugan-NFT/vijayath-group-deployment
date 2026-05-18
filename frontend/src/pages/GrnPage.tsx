import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/DataTable';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { toast } from 'sonner';

type Grn = { id: string; grnNumber: string; receivedAt: string; notes?: string; po?: { poNumber: string; project?: { id: string; name: string }; vendor?: { name: string } } };
type Po = { id: string; poNumber: string; status: string; vendor?: { name: string } };

export function GrnPage() {
  const pq = useProjectQuery();
  const [grns, setGrns] = useState<Grn[]>([]);
  const [pos, setPos] = useState<Po[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ poId: '', grnNumber: '', receivedAt: new Date().toISOString().slice(0, 10), notes: '' });

  const load = () => api<Grn[]>('/grn').then(setGrns);
  useEffect(() => {
    load();
    api<Po[]>(`/pos${pq}`).then((list) => setPos(list.filter((p) => p.status === 'APPROVED')));
  }, [pq]);

  const submit = async () => {
    await api('/grn', { method: 'POST', body: JSON.stringify(form) });
    toast.success('GRN recorded');
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader title="GRN" subtitle="Goods received notes" actions={<Button onClick={() => setOpen(true)}>Record GRN</Button>} />
      <DataTable
        columns={[
          { key: 'num', header: 'GRN #', render: (r) => r.grnNumber },
          { key: 'po', header: 'PO', render: (r) => r.po?.poNumber ?? '—' },
          { key: 'vendor', header: 'Vendor', render: (r) => r.po?.vendor?.name ?? '—' },
          { key: 'project', header: 'Project', render: (r) => r.po?.project ? <Link to={`/projects/${r.po.project.id}`} className="underline">{r.po.project.name}</Link> : '—' },
          { key: 'date', header: 'Received', render: (r) => formatDate(r.receivedAt) },
        ]}
        data={grns}
        keyFn={(r) => r.id}
        emptyMessage="No GRNs yet"
      />
      <FormDialog open={open} onOpenChange={setOpen} title="Record GRN" onSubmit={submit}>
        <div><Label>PO</Label>
          <select className="w-full border rounded px-3 py-2 mt-1" value={form.poId} onChange={(e) => setForm({ ...form, poId: e.target.value })}>
            <option value="">Select PO</option>
            {pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendor?.name}</option>)}
          </select>
        </div>
        <div><Label>GRN number</Label><Input value={form.grnNumber} onChange={(e) => setForm({ ...form, grnNumber: e.target.value })} /></div>
        <div><Label>Received date</Label><Input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></div>
        <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
