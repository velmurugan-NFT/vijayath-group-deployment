import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/design/Card';
import { DataTable } from '@/components/DataTable';
import { toast } from 'sonner';

type Vendor = { id: string; name: string; category: string; gstin?: string; pan?: string; bankAccount?: string };
type VendorDetail = Vendor & {
  purchaseOrders?: { id: string; poNumber: string; totalAmount: number; status: string; project?: { id: string; name: string } }[];
  performance?: { totalBusiness: number; onTimePercent: number; poCount: number };
};

const empty = { name: '', category: 'EPC', gstin: '', pan: '', bankAccount: '' };

export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  const load = () => api<Vendor[]>('/vendors').then(setVendors);
  useEffect(() => { load(); }, []);

  const show = async (id: string) => setDetail(await api<VendorDetail>(`/vendors/${id}`));

  const openCreate = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditId(v.id);
    setForm({ name: v.name, category: v.category, gstin: v.gstin ?? '', pan: v.pan ?? '', bankAccount: v.bankAccount ?? '' });
    setOpen(true);
  };

  const save = async () => {
    if (editId) {
      await api(`/vendors/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      toast.success('Vendor updated');
    } else {
      await api('/vendors', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Vendor created');
    }
    setOpen(false);
    load();
    if (editId) show(editId);
  };

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Vendor master" actions={<Button onClick={openCreate}>Add vendor</Button>} />
      <div className="grid lg:grid-cols-2 gap-6">
        <DataTable
          columns={[
            { key: 'name', header: 'Name', render: (v) => <span className="text-vijayanth-green font-medium">{v.name}</span> },
            { key: 'cat', header: 'Category', render: (v) => v.category },
            { key: 'act', header: '', render: (v) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(v); }}>Edit</Button> },
          ]}
          data={vendors}
          keyFn={(v) => v.id}
          onRowClick={(v) => show(v.id)}
        />
        {detail && (
          <div className="card card-pad p-4">
            <h2 className="font-bold text-vijayanth-green text-lg">{detail.name}</h2>
            <p className="text-sm mt-1">Category: {detail.category}</p>
            <p className="text-sm">GSTIN: {detail.gstin ?? '—'}</p>
            <p className="text-sm mt-3">Total business: {formatINR(detail.performance?.totalBusiness ?? 0)}</p>
            <p className="text-sm">On-time: {detail.performance?.onTimePercent ?? 0}% · {detail.performance?.poCount ?? 0} POs</p>
            <h3 className="font-semibold mt-4 mb-2">Linked POs</h3>
            <ul className="text-sm space-y-1">
              {(detail.purchaseOrders ?? []).map((p) => (
                <li key={p.id}>
                  <Link to={`/pos/${p.id}`} className="underline">{p.poNumber}</Link>
                  {' '}{formatINR(p.totalAmount)} — {p.project && <Link to={`/projects/${p.project.id}`} className="underline">{p.project.name}</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? 'Edit vendor' : 'Add vendor'} onSubmit={save}>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
        <div><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></div>
        <div><Label>Bank account</Label><Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
