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
import { Pencil, PencilLine } from 'lucide-react';
// ── Types ─────────────────────────────────────────────────────────────────────

type Payment = {
  id: string;
  amount: number;
  paidAt: string;
  note?: string;
};

type Inv = {
  id: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  payments: Payment[];
  po?: {
    id: string;
    poNumber: string;
    project?: { id: string; name: string };
    vendor?: { name: string };
  };
};

type Po = { id: string; poNumber: string; status: string; totalAmount: number; vendor?: { name: string } };

// ── Helpers ───────────────────────────────────────────────────────────────────

function paidTotal(inv: Inv) {
  return (inv.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
}

function balance(inv: Inv) {
  return (inv.amount ?? 0) - paidTotal(inv);
}

function paymentStatus(inv: Inv): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const bal = balance(inv);
  if (bal <= 0)              return { label: 'Fully Paid',   variant: 'default' };
  if (paidTotal(inv) === 0)  return { label: 'Unpaid',       variant: 'destructive' };
  return                            { label: 'Partial',      variant: 'secondary' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VendorInvoicesPage() {
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items,       setItems]       = useState<Inv[]>([]);
  const [pos,         setPos]         = useState<Po[]>([]);

  // "Add invoice" dialog
  const [addOpen,    setAddOpen]    = useState(false);
  const [addForm,    setAddForm]    = useState({
    poId: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
  });

  // "Edit invoice" dialog
  const [editTarget, setEditTarget] = useState<Inv | null>(null);
  const [editForm,   setEditForm]   = useState({ amount: 0, invoiceDate: '' });

  // "Record payment" dialog
  const [payTarget,  setPayTarget]  = useState<Inv | null>(null);
  const [payForm,    setPayForm]    = useState({ amount: 0, note: '' });

  // "View payments" dialog
  const [viewTarget, setViewTarget] = useState<Inv | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = () =>
    api<Inv[]>(`/vendor-invoices${pq}`).then(setItems);

  useEffect(() => {
    load();
    // Only approved POs are eligible to be invoiced
    api<Po[]>(`/pos${pq}&status=approved`).then(setPos);
  }, [pq]);

  useEffect(() => {
    setAddForm((f) => ({ ...f, poId: '' }));
  }, [activeProject?.id]);

  // ── Submit: create invoice ────────────────────────────────────────────────

  const submitAdd = async () => {
    if (!addForm.poId) { toast.error('Select a PO'); return; }
    try {
      await api('/vendor-invoices', {
        method: 'POST',
        body: JSON.stringify(addForm),
      });
      toast.success('Vendor invoice created');
      setAddOpen(false);
      setAddForm({ poId: '', invoiceDate: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    }
  };

  // ── Submit: edit invoice ──────────────────────────────────────────────────

  const openEdit = (inv: Inv) => {
    setEditTarget(inv);
    setEditForm({
      amount:      inv.amount,
      invoiceDate: inv.invoiceDate.slice(0, 10),
    });
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editForm.amount || editForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await api(`/vendor-invoices/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      toast.success('Invoice updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update invoice');
    }
  };

  // ── Submit: record payment ────────────────────────────────────────────────

  const openPay = (inv: Inv) => {
    setPayTarget(inv);
    setPayForm({ amount: balance(inv), note: '' });
  };

  const submitPay = async () => {
    if (!payTarget) return;
    const bal = balance(payTarget);
    if (!payForm.amount || payForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (payForm.amount > bal) {
      toast.error(`Amount exceeds balance of ${formatINR(bal)}`);
      return;
    }
    try {
      await api(`/vendor-invoices/${payTarget.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(payForm),
      });
      toast.success('Payment recorded');
      setPayTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Vendor invoices"
        subtitle="Invoices linked to POs"
        actions={<Button onClick={() => setAddOpen(true)}>Add invoice</Button>}
      />

      <DataTable
        columns={[
          {
            key: 'num',
            header: 'Invoice #',
            render: (r) => (
              <button
                className="font-mono text-sm underline underline-offset-2 hover:text-primary"
                onClick={() => setViewTarget(r)}
              >
                {r.invoiceNumber}
              </button>
            ),
          },
          { key: 'po',     header: 'PO',      render: (r) => r.po?.poNumber ?? '—' },
          { key: 'vendor', header: 'Vendor',  render: (r) => r.po?.vendor?.name ?? '—' },
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
          { key: 'total',   header: 'Invoice Amt',  render: (r) => formatINR(r.amount) },
          { key: 'paid',    header: 'Paid',         render: (r) => formatINR(paidTotal(r)) },
          {
            key: 'balance',
            header: 'Balance',
            render: (r) => (
              <span className={balance(r) > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                {formatINR(balance(r))}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const s = paymentStatus(r);
              return <Badge variant={s.variant}>{s.label}</Badge>;
            },
          },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
         {
  key: 'actions',
  header: 'Action',

  render: (r) => (

    <div
      className="
      flex
      justify-end
      items-center
      gap-2
    "
    >

      {balance(r) > 0 && (

        <Button
          size="sm"
          variant="default"
          onClick={() => openPay(r)}
        >
          Pay
        </Button>

      )}

      <button
        type="button"
        title="Edit invoice"

        onClick={() => openEdit(r)}

        className="
        p-2
        rounded-md
        hover:bg-blue-100
        text-muted-foreground
        hover:text-blue-600
        transition
        "
      >

        <Pencil
          size={16}
        />

      </button>

    </div>

  ),
}
        ]}
        data={items}
        keyFn={(r) => r.id}
      />

      {/* ── Add Invoice Dialog ────────────────────────────────────────────── */}
      <FormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add vendor invoice"
        onSubmit={submitAdd}
      >
        <div>
          <Label>PO (approved only) *</Label>
          <select
            className="w-full border rounded px-3 py-2 mt-1"
            value={addForm.poId}
            onChange={(e) => setAddForm({ ...addForm, poId: e.target.value })}
          >
            <option value="">— Select PO —</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber}{p.vendor?.name ? ` — ${p.vendor.name}` : ''} ({formatINR(Number(p.totalAmount))})
              </option>
            ))}
            {pos.length === 0 && (
              <option disabled>No approved POs found for this project</option>
            )}
          </select>
        </div>
        <div>
          <Label>Invoice # </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated on save (e.g. VI-202506-0001)
          </p>
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

      {/* ── Edit Invoice Dialog ───────────────────────────────────────────── */}
      <FormDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit invoice ${editTarget?.invoiceNumber ?? ''}`}
        onSubmit={submitEdit}
      >
        {editTarget && (
          <>
            <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already paid</span>
                <span className="font-medium">{formatINR(paidTotal(editTarget))}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Invoice amount cannot be set below the paid total.
              </p>
            </div>
            <div>
              <Label>Invoice amount (₹) *</Label>
              <Input
                type="number"
                min={paidTotal(editTarget)}
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })}
              />
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

      {/* ── Record Payment Dialog ─────────────────────────────────────────── */}
      <FormDialog
        open={!!payTarget}
        onOpenChange={(o) => { if (!o) setPayTarget(null); }}
        title="Record payment"
        onSubmit={submitPay}
      >
        {payTarget && (
          <>
            {/* Balance summary card */}
            <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice total</span>
                <span className="font-medium">{formatINR(payTarget.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid so far</span>
                <span className="font-medium">{formatINR(paidTotal(payTarget))}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-semibold">Remaining balance</span>
                <span className="font-bold text-orange-600">{formatINR(balance(payTarget))}</span>
              </div>
            </div>

            <div>
              <Label>Payment amount (₹) *</Label>
              <Input
                type="number"
                min={1}
                max={balance(payTarget)}
                value={payForm.amount}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPayForm({ ...payForm, amount: v });
                }}
              />
              {payForm.amount > balance(payTarget) && (
                <p className="text-xs text-destructive mt-1">
                  Exceeds remaining balance of {formatINR(balance(payTarget))}
                </p>
              )}
            </div>

            <div>
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g. NEFT ref #12345"
                value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
              />
            </div>
          </>
        )}
      </FormDialog>

      {/* ── View Payment History Dialog ───────────────────────────────────── */}
      <FormDialog
        open={!!viewTarget}
        onOpenChange={(o) => { if (!o) setViewTarget(null); }}
        title={`Payments — ${viewTarget?.invoiceNumber ?? ''}`}
        onSubmit={() => setViewTarget(null)}
        submitLabel="Close"
        hideCancel
      >
        {viewTarget && (
          <div className="space-y-3">
            {/* Summary row */}
            <div className="rounded-md bg-muted px-4 py-3 text-sm grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-muted-foreground text-xs">Invoice total</p>
                <p className="font-semibold">{formatINR(viewTarget.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total paid</p>
                <p className="font-semibold text-green-600">{formatINR(paidTotal(viewTarget))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Balance</p>
                <p className={`font-semibold ${balance(viewTarget) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatINR(balance(viewTarget))}
                </p>
              </div>
            </div>

            {/* Payment list */}
            {viewTarget.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payments recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b">
                    <th className="text-left py-1">#</th>
                    <th className="text-left py-1">Date</th>
                    <th className="text-right py-1">Amount</th>
                    <th className="text-left py-1 pl-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {viewTarget.payments.map((p, i) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-1 text-muted-foreground">{i + 1}</td>
                      <td className="py-1">{formatDate(p.paidAt)}</td>
                      <td className="py-1 text-right font-medium">{formatINR(p.amount)}</td>
                      <td className="py-1 pl-4 text-muted-foreground">{p.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Quick-pay button if balance remains */}
            {balance(viewTarget) > 0 && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setViewTarget(null);
                  openPay(viewTarget);
                }}
              >
                Record next payment ({formatINR(balance(viewTarget))} remaining)
              </Button>
            )}
          </div>
        )}
      </FormDialog>
    </div>
  );
}
