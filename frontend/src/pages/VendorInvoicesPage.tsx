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
  // ✅ Computed by backend: sum of Payment.amount via PaymentRequest → Payment
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

/** Sum of all invoice amounts already raised against a PO (from the items list). */
function poInvoicedFromItems(items: Inv[], poId: string, excludeInvId?: string) {
  return items
    .filter((i) => i.po?.id === poId && i.id !== excludeInvId)
    .reduce((s, i) => s + (i.amount ?? 0), 0);
}

/**
 * paidAmount comes directly from the backend (PaymentRequest → Payment).
 * VendorInvoicePayment is a separate sub-system and is NOT used here.
 */
function invoicePaidAmount(inv: Inv): number {
  return Number(inv.paidAmount ?? 0);
}

/**
 * Derive the display status for an invoice row:
 *   'PAID'            — backend confirms isPaid = true
 *   'FULLY_INVOICED'  — PO fully invoiced but not yet fully paid
 *   'PARTIAL'         — PO still has remaining balance
 */
function invoiceDisplayStatus(
  inv: Inv,
  items: Inv[],
): 'PAID' | 'FULLY_INVOICED' | 'PARTIAL' {
  if (inv.isPaid === true) return 'PAID';

  const invoiced = poInvoicedFromItems(items, inv.po?.id ?? '');
  const bal = Number(inv.po?.totalAmount ?? 0) - invoiced;
  if (bal <= 0) return 'FULLY_INVOICED';

  return 'PARTIAL';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VendorInvoicesPage() {
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items, setItems] = useState<Inv[]>([]);
  const [pos,   setPos]   = useState<Po[]>([]);

  // "Add invoice" dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    poId:          '',
    amount:        0,
    invoiceNumber: '',
    invoiceDate:   new Date().toISOString().slice(0, 10),
  });

  // "Edit invoice" dialog
  const [editTarget, setEditTarget] = useState<Inv | null>(null);
  const [editForm,   setEditForm]   = useState({ amount: 0, invoiceDate: '' });

  // ── Data loading ────────────────────────────────────────────────────────

  // NOTE: make sure your /vendor-invoices endpoint includes
  // payments: { id, amount, status } in its response shape.
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

  const addPo = pos.find((p) => p.id === addForm.poId);

  const addAlreadyInvoiced = addPo ? poInvoicedFromItems(items, addPo.id) : 0;
  const addPoBalance       = addPo ? Number(addPo.totalAmount) - addAlreadyInvoiced : 0;
  const addAmountExceeds   = addForm.amount > addPoBalance;

  // ✅ Warn if the selected PO already has an invoice (but still allow if balance remains)
  const addPoExistingInvoices = addPo
    ? items.filter((i) => i.po?.id === addPo.id)
    : [];
  const addPoAlreadyHasInvoice = addPoExistingInvoices.length > 0;

  const handleAddPoChange = (poId: string) => {
    const po      = pos.find((p) => p.id === poId);
    const invoiced = po ? poInvoicedFromItems(items, po.id) : 0;
    const bal      = po ? Number(po.totalAmount) - invoiced : 0;
    setAddForm((f) => ({ ...f, poId, amount: bal }));
  };

  // ── Derived: edit dialog ────────────────────────────────────────────────

  const editAlreadyInvoiced = editTarget
    ? poInvoicedFromItems(items, editTarget.po?.id ?? '', editTarget.id)
    : 0;
  const editPoTotal      = Number(editTarget?.po?.totalAmount ?? 0);
  const editPoBalance    = editTarget ? editPoTotal - editAlreadyInvoiced : Infinity;
  const editAmountExceeds = editForm.amount > editPoBalance;

  // ── Submit: create invoice ──────────────────────────────────────────────

  const submitAdd = async () => {
    if (!addForm.poId)                          { toast.error('Select a PO'); return; }
    if (!addForm.amount || addForm.amount <= 0) { toast.error('Enter invoice amount'); return; }
    if (addAmountExceeds) {
      toast.error(`Amount exceeds PO balance of ${formatINR(addPoBalance)}`);
      return;
    }
    try {
      const result = await api<{ _merged?: boolean; invoiceNumber?: string }>(
        '/vendor-invoices',
        { method: 'POST', body: JSON.stringify(addForm) },
      );
      // Backend merges into existing invoice when PO already has one
      if (result._merged) {
        toast.success(`Amount added to existing invoice ${result.invoiceNumber}`);
      } else {
        toast.success(`Vendor invoice ${result.invoiceNumber} created`);
      }
      setAddOpen(false);
      setAddForm({
        poId: '',
        amount: 0,
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
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
          // ✅ Amount paid column — shows how much has been paid against this invoice
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
            render: (r) => {
              const status = invoiceDisplayStatus(r, items);
              if (status === 'PAID') {
                return (
                  <Badge
                    variant="default"
                    className="bg-green-600 hover:bg-green-600 text-white"
                  >
                    Paid
                  </Badge>
                );
              }
              if (status === 'FULLY_INVOICED') {
                return <Badge variant="default">Fully Invoiced</Badge>;
              }
              return <Badge variant="secondary">Partial</Badge>;
            },
          },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <button
                type="button"
                title="Edit invoice"
                onClick={() => openEdit(r)}
                className="p-2 rounded-md hover:bg-blue-100 text-muted-foreground hover:text-blue-600 transition"
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
        title={addPoAlreadyHasInvoice ? `Add amount to ${addPoExistingInvoices[0]?.invoiceNumber}` : 'Add vendor invoice'}
        onSubmit={submitAdd}
      >
        {/* PO selector */}
        <div>
          <Label>PO (approved only) *</Label>
          <select
            className="w-full border rounded px-3 py-2 mt-1"
            value={addForm.poId}
            onChange={(e) => handleAddPoChange(e.target.value)}
          >
            <option value="">— Select PO —</option>
            {pos.map((p) => {
              const invoiced = poInvoicedFromItems(items, p.id);
              const bal = Number(p.totalAmount) - invoiced;
              return (
                <option key={p.id} value={p.id} disabled={bal <= 0}>
                  {p.poNumber}{p.vendor?.name ? ` (${p.vendor.name})` : ''}
                  {bal <= 0 ? ' — fully invoiced' : ''}
                </option>
              );
            })}
            {pos.length === 0 && <option disabled>No approved POs found</option>}
          </select>
        </div>

        {/* ✅ Info: PO already has an invoice — this amount will be MERGED into it */}
        {addPoAlreadyHasInvoice && addPoBalance > 0 && (
          <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">
              Amount will be added to {addPoExistingInvoices[0]?.invoiceNumber}
            </p>
            <p>
             <strong>{formatINR(addPoBalance)}</strong>.
            </p>
          </div>
        )}

        {/* Balance info */}
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
              <p className="text-muted-foreground text-xs">Available Balance</p>
              <p className="font-semibold text-orange-600">{formatINR(addPoBalance)}</p>
            </div>
          </div>
        )}

        {/* Invoice amount */}
        <div>
          <Label>
            {addPoAlreadyHasInvoice ? 'Amount to add (₹) *' : 'Invoice Amount (₹) *'}
          </Label>
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
              Exceeds available balance of {formatINR(addPoBalance)}
            </p>
          )}
        </div>

        {/* Invoice # — only shown when creating a brand-new invoice */}
        {!addPoAlreadyHasInvoice && (
          <div>
            <Label>Invoice #</Label>
            <Input
              placeholder="Auto-generated on save"
              value={addForm.invoiceNumber ?? ''}
              onChange={(e) => setAddForm({ ...addForm, invoiceNumber: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave blank to auto-generate, or type a custom number.
            </p>
          </div>
        )}

        {/* Date */}
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
            {/* PO balance info */}
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

            {/* ✅ Payment summary — shows how much is already paid on this invoice */}
            {(editTarget.payments?.length ?? 0) > 0 && (
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
