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
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Inv = {
  id: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  paidAmount: number;
  isPaid: boolean;
  po?: {
    id: string;
    poNumber: string;
    totalAmount: number;
    project?: { id: string; name: string };
    vendor?: { name: string };
    vendorInvoices?: { id: string; amount: number }[];
  };
};

type Po = {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  vendor?: { name: string };
  vendorInvoices?: { id: string; amount: number }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function poInvoicedFromItems(items: Inv[], poId: string, excludeInvId?: string) {
  return items
    .filter((i) => i.po?.id === poId && i.id !== excludeInvId)
    .reduce((s, i) => s + (i.amount ?? 0), 0);
}

function poRemainingBalance(items: Inv[], po: Po, excludeInvId?: string): number {
  const invoiced = poInvoicedFromItems(items, po.id, excludeInvId);
  return Math.max(0, Number(po.totalAmount) - invoiced);
}

function invoicePaidAmount(inv: Inv): number {
  return Number(inv.paidAmount ?? 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VendorInvoicesPage() {
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items, setItems] = useState<Inv[]>([]);
  const [pos,   setPos]   = useState<Po[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    poId:          '',
    amount:        0,
    invoiceNumber: '',
    invoiceDate:   new Date().toISOString().slice(0, 10),
  });

  const [editTarget, setEditTarget] = useState<Inv | null>(null);
  const [editForm,   setEditForm]   = useState({ amount: 0, invoiceDate: '' });

  // ── Data loading ────────────────────────────────────────────────────────

  const load = () =>
    api<Inv[]>(`/vendor-invoices${pq}`).then(setItems);

  const loadPos = () =>
    api<Po[]>(`/pos${pq}`).then((all) =>
      setPos(all.filter((p) => p.status === 'APPROVED' || p.status === 'SENT_TO_VENDOR'))
    );

  useEffect(() => { load(); loadPos(); }, [pq]);

  useEffect(() => {
    setAddForm((f) => ({ ...f, poId: '', amount: 0 }));
  }, [activeProject?.id]);

  // ── Derived: add dialog ─────────────────────────────────────────────────

  const addPo              = pos.find((p) => p.id === addForm.poId);
  const addAlreadyInvoiced = addPo ? poInvoicedFromItems(items, addPo.id) : 0;
  const addPoBalance       = addPo ? poRemainingBalance(items, addPo) : 0;
  const addAmountExceeds   = addForm.amount > addPoBalance;

  const handleAddPoChange = (poId: string) => {
    const po  = pos.find((p) => p.id === poId);
    const bal = po ? poRemainingBalance(items, po) : 0;
    setAddForm((f) => ({ ...f, poId, amount: bal }));
  };

  // ── Derived: edit dialog ────────────────────────────────────────────────

  const editAlreadyInvoiced = editTarget
    ? poInvoicedFromItems(items, editTarget.po?.id ?? '', editTarget.id)
    : 0;
  const editPoTotal       = Number(editTarget?.po?.totalAmount ?? 0);
  const editPoBalance     = editTarget ? editPoTotal - editAlreadyInvoiced : Infinity;
  const editAmountExceeds = editForm.amount > editPoBalance;

  // ── Submit: create invoice ──────────────────────────────────────────────

  const submitAdd = async () => {
    if (!addForm.poId)                          { toast.error('Select a PO'); return; }
    if (!addForm.amount || addForm.amount <= 0) { toast.error('Enter invoice amount'); return; }
    if (addAmountExceeds) {
      toast.error(`Amount exceeds remaining PO balance of ${formatINR(addPoBalance)}`);
      return;
    }
    try {
      const result = await api<{ invoiceNumber?: string }>(
        '/vendor-invoices',
        { method: 'POST', body: JSON.stringify(addForm) },
      );
      toast.success(`Vendor invoice ${result.invoiceNumber} created`);
      setAddOpen(false);
      setAddForm({
        poId:          '',
        amount:        0,
        invoiceNumber: '',
        invoiceDate:   new Date().toISOString().slice(0, 10),
      });
      load();
      loadPos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    }
  };

  // ── Submit: edit invoice ────────────────────────────────────────────────

  const openEdit = (inv: Inv) => {
    setEditTarget(inv);
    setEditForm({ amount: inv.amount, invoiceDate: inv.invoiceDate.slice(0, 10) });
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editForm.amount || editForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (editAmountExceeds) {
      toast.error(`Amount exceeds remaining PO balance of ${formatINR(editPoBalance)}`);
      return;
    }
    try {
      await api(`/vendor-invoices/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      toast.success('Invoice updated');
      setEditTarget(null);
      load();
      loadPos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update invoice');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Vendor Invoices"
        subtitle="Invoices raised against approved POs"
        actions={<Button onClick={() => setAddOpen(true)}>Add invoice</Button>}
      />

      <DataTable
        columns={[
          {
            key: 'num',
            header: 'Invoice #',
            render: (r) => (
              <span className="font-mono text-sm font-medium">{r.invoiceNumber}</span>
            ),
          },
          { key: 'po',     header: 'PO',     render: (r) => r.po?.poNumber ?? '—' },
          { key: 'vendor', header: 'Vendor', render: (r) => r.po?.vendor?.name ?? '—' },
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
          {
            key: 'po_total',
            header: 'PO Amount',
            render: (r) => formatINR(Number(r.po?.totalAmount ?? 0)),
          },
          {
            key: 'inv_amount',
            header: 'Invoice Amount',
            render: (r) => formatINR(r.amount),
          },
          {
            key: 'paid_amount',
            header: 'Paid',
            render: (r) => {
              const paid = invoicePaidAmount(r);
              return paid > 0 ? (
                <span className="text-green-700 font-semibold">{formatINR(paid)}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              );
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) =>
              r.isPaid ? (
                <Badge className="bg-green-600 hover:bg-green-600 text-white">Paid</Badge>
              ) : (
                <Badge variant="secondary">Unpaid</Badge>
              ),
          },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
      {
          key: 'actions',
          header: 'Action',
          render: (r) => (
            <button
              type="button"
              title="Edit Invoice"
              onClick={() => openEdit(r)}
              className="flex items-center justify-center p-2 rounded-md hover:bg-blue-100 text-muted-foreground hover:text-blue-600 transition"
            >
              <Pencil size={16} />
            </button>
          ),
        },
        ]}
        data={items}
        keyFn={(r) => r.id}
      />

      {/* ── Add Invoice Dialog ──────────────────────────────────────────── */}
      <FormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add vendor invoice"
        onSubmit={submitAdd}
      >
        <div>
          <Label>PO (approved only) *</Label>
          {/* Wrapper gives us a positioning context for the overlay */}
          <div style={{ position: 'relative' }}>
            <select
              className="w-full border rounded px-3 py-2 mt-1"
              value={addForm.poId}
              onChange={(e) => handleAddPoChange(e.target.value)}
              style={{ color: addForm.poId ? 'transparent' : undefined }}
            >
              <option value="">— Select PO —</option>
              {pos.map((p) => {
                const remaining = poRemainingBalance(items, p);
                const fullyUsed = remaining <= 0;
                return (
                  <option key={p.id} value={p.id} disabled={fullyUsed}>
                    {p.poNumber}{p.vendor?.name ? ` (${p.vendor.name})` : ''}
                    {fullyUsed ? ' — fully invoiced' : ` — ${formatINR(remaining)} remaining`}
                  </option>
                );
              })}
              {pos.length === 0 && <option disabled>No approved POs found</option>}
            </select>

            {/* Overlay: shows only PO# (Vendor Name) when a PO is selected */}
            {addForm.poId && addPo && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 12,
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: 'calc(100% - 36px)',
                }}
              >
                {addPo.poNumber}{addPo.vendor?.name ? ` (${addPo.vendor.name})` : ''}
              </div>
            )}
          </div>
        </div>

        {addPo && (
          <div className="rounded-md bg-muted px-4 py-3 text-sm grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-muted-foreground text-xs">PO Total</p>
              <p className="font-semibold">{formatINR(Number(addPo.totalAmount))}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Already Invoiced</p>
              <p className="font-semibold">{formatINR(addAlreadyInvoiced)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Remaining Balance</p>
              <p className="font-semibold text-orange-600">{formatINR(addPoBalance)}</p>
            </div>
          </div>
        )}

        <div>
          <Label>Invoice Amount (₹) *</Label>
          <Input
            type="number"
            min={1}
            max={addPoBalance}
            value={addForm.amount || ''}
            onChange={(e) => setAddForm({ ...addForm, amount: Number(e.target.value) })}
            className={addAmountExceeds ? 'border-destructive' : ''}
          />
          {addAmountExceeds && (
            <p className="text-xs text-destructive mt-1">
              Exceeds remaining balance of {formatINR(addPoBalance)}
            </p>
          )}
        </div>

        <div>
          <Label>Invoice #</Label>
          <Input
            placeholder="Auto-generated on save"
            value={addForm.invoiceNumber ?? ''}
            onChange={(e) => setAddForm({ ...addForm, invoiceNumber: e.target.value })}
          />
        </div>

        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={addForm.invoiceDate}
            onChange={(e) => setAddForm({ ...addForm, invoiceDate: e.target.value })}
          />
        </div>
      </FormDialog>

      {/* ── Edit Invoice Dialog ─────────────────────────────────────────── */}
      <FormDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit invoice ${editTarget?.invoiceNumber ?? ''}`}
        onSubmit={submitEdit}
      >
        {editTarget && (
          <>
            <div className="rounded-md bg-muted px-4 py-3 text-sm grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-muted-foreground text-xs">PO Total</p>
                <p className="font-semibold">{formatINR(editPoTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Other Invoices</p>
                <p className="font-semibold">{formatINR(editAlreadyInvoiced)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Max for this Invoice</p>
                <p className="font-semibold text-orange-600">{formatINR(editPoBalance)}</p>
              </div>
            </div>

            {invoicePaidAmount(editTarget) > 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-muted-foreground text-xs">Invoice Amount</p>
                  <p className="font-semibold">{formatINR(editTarget.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Already Paid</p>
                  <p className="font-semibold text-green-700">
                    {formatINR(invoicePaidAmount(editTarget))}
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label>Invoice Amount (₹) *</Label>
              <Input
                type="number"
                min={1}
                max={editPoBalance}
                value={editForm.amount || ''}
                onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })}
                className={editAmountExceeds ? 'border-destructive' : ''}
              />
              {editAmountExceeds && (
                <p className="text-xs text-destructive mt-1">
                  Exceeds available balance of {formatINR(editPoBalance)}
                </p>
              )}
            </div>

            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={editForm.invoiceDate}
                onChange={(e) => setEditForm({ ...editForm, invoiceDate: e.target.value })}
              />
            </div>
            

          </>
        )}
      </FormDialog>
    </div>
  );
}
