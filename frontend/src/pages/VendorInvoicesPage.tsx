import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/DataTable';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { toast } from 'sonner';
import { useProjectContext } from '@/context/ProjectContext';

type Inv = {
  id: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  po?: {
    id: string;
    poNumber: string;
    project?: { id: string; name: string };
    vendor?: { name: string };
  };
};
type Po = { id: string; poNumber: string; status: string; vendor?: { name: string } };

export function VendorInvoicesPage() {
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items, setItems] = useState<Inv[]>([]);
  // All approved POs in the current project scope — fetched directly,
  // not derived from invoices so new POs always appear in the dropdown.
  const [pos, setPos]     = useState<Po[]>([]);
  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState({
    poId: '',
    invoiceNumber: '',
    amount: 0,
    invoiceDate: new Date().toISOString().slice(0, 10),
  });

  const load = () => api<Inv[]>(`/vendor-invoices${pq}`).then(setItems);

  useEffect(() => {
    load();
    // Fetch POs scoped to the active project query; filter to APPROVED only.
    api<Po[]>(`/pos${pq}`)
      .then((list) => setPos(list.filter((p) => p.status === 'APPROVED')));
  }, [pq]);

  // Reset selected PO when project scope changes.
  useEffect(() => {
    setForm((f) => ({ ...f, poId: '' }));
  }, [activeProject?.id]);

  const submit = async () => {
    await api('/vendor-invoices', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    toast.success('Vendor invoice recorded');
    setOpen(false);
    setForm({ poId: '', invoiceNumber: '', amount: 0, invoiceDate: new Date().toISOString().slice(0, 10) });
    load();
  };

  return (
    <div>
      <PageHeader
        title="Vendor invoices"
        subtitle="Invoices linked to POs"
        actions={<Button onClick={() => setOpen(true)}>Add invoice</Button>}
      />

      <DataTable
        columns={[
          { key: 'num',    header: 'Invoice #', render: (r) => r.invoiceNumber },
          { key: 'po',     header: 'PO',        render: (r) => r.po?.poNumber ?? '—' },
          { key: 'vendor', header: 'Vendor',    render: (r) => r.po?.vendor?.name ?? '—' },
          { key: 'amt',    header: 'Amount',    render: (r) => formatINR(r.amount) },
          { key: 'date',   header: 'Date',      render: (r) => formatDate(r.invoiceDate) },
          {
            key: 'proj',
            header: 'Project',
            render: (r) =>
              r.po?.project ? (
                <Link to={`/projects/${r.po.project.id}`} className="underline">
                  {r.po.project.name}
                </Link>
              ) : '—',
          },
        ]}
        data={items}
        keyFn={(r) => r.id}
      />

      <FormDialog open={open} onOpenChange={setOpen} title="Vendor invoice" onSubmit={submit}>
        <div>
          <Label>PO</Label>
          <select
            className="w-full border rounded px-3 py-2 mt-1"
            value={form.poId}
            onChange={(e) => setForm({ ...form, poId: e.target.value })}
          >
            <option value="">Select PO</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber}{p.vendor?.name ? ` — ${p.vendor.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Invoice #</Label>
          <Input
            value={form.invoiceNumber}
            onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
          />
        </div>
        <div>
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={form.invoiceDate}
            onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
          />
        </div>
      </FormDialog>
    </div>
  );
}
