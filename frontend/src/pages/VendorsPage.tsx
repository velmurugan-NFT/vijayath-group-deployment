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
import { toast } from 'sonner';
import { useProjectContext } from '@/context/ProjectContext';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

type Vendor = {
  id: string;
  name: string;
  category: string;
  gstin?: string;
  pan?: string;
  bankName?: string;
  accountNo?: string;
  ifsc?: string;
  // contact?: string;
};
type VendorDetail = Vendor & {
  purchaseOrders?: {
    id: string;
    poNumber: string;
    totalAmount: number;
    status: string;
    project?: { id: string; name: string };
  }[];
  performance?: { totalBusiness: number; onTimePercent: number; poCount: number };
};

const empty = {
  name: '',
  category: 'EPC',
  gstin: '',
  pan: '',
  bankName: '',
  accountNo: '',
  ifsc: '',
  // contact: '',
};

// ─── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteVendorModal({
  vendor, onConfirm, onCancel, deleting,
}: {
  vendor: Vendor | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (vendor) setTyped(''); }, [vendor]);
  if (!vendor) return null;

  const confirmed = typed.trim().toLowerCase() === vendor.name.trim().toLowerCase();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '2rem 2rem 1.75rem', maxWidth: 460, width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--line)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', marginBottom: 6 }}>Delete vendor permanently?</div>
        <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>⚠ This cannot be undone</div>
          <div style={{ color: '#7f1d1d' }}>Deleting <strong>"{vendor.name}"</strong> will permanently remove this vendor and all associated records.</div>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
            Type <strong style={{ color: 'var(--ink)' }}>{vendor.name}</strong> to confirm:
          </div>
          <input
            type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={vendor.name} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: 7, border: typed.length > 0 ? confirmed ? '1.5px solid var(--success)' : '1.5px solid var(--danger)' : '1.5px solid var(--line)', fontSize: '0.875rem', outline: 'none', background: confirmed ? 'var(--success-soft)' : 'var(--surface)', transition: 'border-color 0.15s, background 0.15s' }}
          />
          {typed.length > 0 && !confirmed && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: 4 }}>Name does not match — keep typing</div>}
          {confirmed && <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginTop: 4 }}>✓ Confirmed</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={deleting}>Cancel — keep vendor</button>
          <button type="button" disabled={!confirmed || deleting} onClick={onConfirm}
            style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', border: 'none', display: 'flex', alignItems: 'center', gap: 6, background: confirmed && !deleting ? '#dc2626' : '#f3a9a9', color: '#fff', transition: 'background 0.15s' }}>
            {deleting ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Deleting…</> : <><Trash2 style={{ width: 14, height: 14 }} /> Delete vendor</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VendorsPage ───────────────────────────────────────────────────────────────
export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const { activeProject } = useProjectContext();
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => api<Vendor[]>('/vendors').then(setVendors);
  useEffect(() => { load(); }, []);

  const show = async (id: string) => setDetail(await api<VendorDetail>(`/vendors/${id}`));

  const openCreate = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditId(v.id);
    setForm({
      name:      v.name,
      category:  v.category,
      gstin:     v.gstin     ?? '',
      pan:       v.pan       ?? '',
      bankName:  v.bankName  ?? '',
      accountNo: v.accountNo ?? '',
      ifsc:      v.ifsc      ?? '',
      // contact:   v.contact   ?? '',
    });
    setOpen(true);
  };

  const filteredPOs = activeProject
    ? (detail?.purchaseOrders ?? []).filter((p) => p.project?.id === activeProject.id)
    : (detail?.purchaseOrders ?? []);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (editId) {
      await api(`/vendors/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      toast.success('Vendor updated');
      show(editId);
    } else {
      await api('/vendors', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Vendor created');
    }
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/vendors/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete vendor');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <DeleteVendorModal
        vendor={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />

      <PageHeader title="Vendors" subtitle="Vendor master" actions={<Button onClick={openCreate}>Add vendor</Button>} />

      <Card>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Name</th>
              <th>Category</th>
              <th>GSTIN</th>
              <th>PAN</th>
              <th>Bank Name</th>
              <th>Account No</th>
              <th>IFSC</th>
              <th className="right" style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => show(v.id)}>
                <td><span style={{ fontWeight: 600, color: 'var(--green)' }}>{v.name}</span></td>
                <td>{v.category}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.gstin || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.pan || '—'}</td>
                <td>{v.bankName || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.accountNo || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.ifsc || '—'}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <button type="button" title="Edit vendor" className="btn btn-ghost btn-sm"
                      style={{ padding: '0 8px', color: 'var(--muted)' }} onClick={() => openEdit(v)}>
                      <Pencil style={{ width: 13, height: 13 }} />
                    </button>
                    <button type="button" title="Delete vendor" className="btn btn-sm"
                      style={{ padding: '0 8px', color: 'var(--danger)', border: '1px solid transparent', background: 'transparent' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(182,52,42,.25)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                      onClick={() => setDeleteTarget(v)}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No vendors found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Vendor detail panel */}
      {detail && (
        <div className="card card-pad p-4" style={{ marginTop: '1.5rem' }}>
          <h2 className="font-bold text-vijayanth-green text-lg">{detail.name}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1.5rem', marginTop: '0.5rem' }}>
            <p className="text-sm">Category: <strong>{detail.category}</strong></p>
            <p className="text-sm">GSTIN: <strong>{detail.gstin ?? '—'}</strong></p>
            <p className="text-sm">PAN: <strong>{detail.pan ?? '—'}</strong></p>
            <p className="text-sm">Bank: <strong>{detail.bankName ?? '—'}</strong></p>
            <p className="text-sm">Account No: <strong style={{ fontFamily: 'monospace' }}>{detail.accountNo ?? '—'}</strong></p>
            <p className="text-sm">IFSC: <strong style={{ fontFamily: 'monospace' }}>{detail.ifsc ?? '—'}</strong></p>
            {/* <p className="text-sm">Contact: <strong>{detail.contact ?? '—'}</strong></p> */}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
            <p className="text-sm">Total business: <strong>{formatINR(detail.performance?.totalBusiness ?? 0)}</strong></p>
            <p className="text-sm">On-time: <strong>{detail.performance?.onTimePercent ?? 0}%</strong></p>
            <p className="text-sm">POs: <strong>{detail.performance?.poCount ?? 0}</strong></p>
          </div>
          <h3 className="font-semibold mt-4 mb-2">Linked POs</h3>
          <ul className="text-sm space-y-1">
            {filteredPOs.map((p) => (
              <li key={p.id}>
                <Link to={`/pos/${p.id}`} className="underline">{p.poNumber}</Link>
                {' '}{formatINR(p.totalAmount)} —{' '}
                {p.project && <Link to={`/projects/${p.project.id}`} className="underline">{p.project.name}</Link>}
              </li>
            ))}
            {filteredPOs.length === 0 && <li style={{ color: 'var(--muted)' }}>No purchase orders.</li>}
          </ul>
        </div>
      )}

      {/* Create / Edit dialog */}
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? 'Edit vendor' : 'Add vendor'} onSubmit={save}>
        <div className="field"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        <div className="field"><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
        <div className="field"><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></div>
        {/* <div className="field"><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div> */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bank Details</div>
          <div className="field"><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
          <div className="field"><Label>Account Number</Label><Input value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} /></div>
          <div className="field"><Label>IFSC Code</Label><Input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value })} /></div>
        </div>
      </FormDialog>
    </div>
  );
}
