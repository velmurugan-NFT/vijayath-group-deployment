import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { useProjectContext } from '@/context/ProjectContext';
import { Loader2, Send, Zap, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type VendorInvoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  isPaid: boolean;
  po?: {
    id: string;
    poNumber: string;
    vendor?: { name: string };
  };
};

type PaymentItem = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  purpose?: string;
  po?: { poNumber: string; vendor?: { name: string } };
  vendorInvoice?: { id: string; invoiceNumber: string };
  payment?: { utr: string; paidAt: string };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function paidAmount(inv: VendorInvoice): number {
  return Number(inv.paidAmount ?? 0);
}

function invoiceBalance(inv: VendorInvoice): number {
  return Math.max(0, Number(inv.amount) - paidAmount(inv));
}

function isFullyPaid(inv: VendorInvoice): boolean {
  return inv.isPaid === true;
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  item,
  onConfirm,
  onCancel,
  deleting,
}: {
  item: PaymentItem | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  if (!item) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 420, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        {/* Red trash icon */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#fee2e2', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <Trash2 size={20} color="#ef4444" />
        </div>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6, color: 'var(--ink)' }}>
          Delete payment request?
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You are about to delete the payment request for{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {item.vendorInvoice?.invoiceNumber ?? item.purpose ?? '—'}
          </strong>{' '}
          ({formatINR(item.amount)}). This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 7, padding: '7px 18px', fontWeight: 600,
              fontSize: '0.875rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {deleting
              ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Deleting…</>
              : 'Yes, delete it'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { user } = useAuth();
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items,        setItems]        = useState<PaymentItem[]>([]);
  const [invoices,     setInvoices]     = useState<VendorInvoice[]>([]);
  const [invoiceId,    setInvoiceId]    = useState('');
  const [amount,       setAmount]       = useState(0);
  const [utr,          setUtr]          = useState('');
  const [approvedId,   setApprovedId]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [executing,    setExecuting]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentItem | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId) ?? null;
  const payableInvoices = invoices.filter((inv) => !isFullyPaid(inv));

  // ── Check if invoice already has a pending/approved payment ──────────────
  // Invoices that already have an active (non-paid, non-deleted) payment request
  const activePaymentInvoiceIds = new Set(
    items
      .filter((p) => ['PENDING_APPROVAL', 'APPROVED', 'DRAFT'].includes(p.status))
      .map((p) => p.vendorInvoice?.id)
      .filter(Boolean) as string[]
  );

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = () =>
    api<PaymentItem[]>(`/payments${pq}`).then(setItems);

  const loadInvoices = () =>
    api<VendorInvoice[]>(`/vendor-invoices${pq}`).then(setInvoices);

  useEffect(() => { load(); loadInvoices(); }, [pq]);

  useEffect(() => {
    setInvoiceId('');
    setAmount(0);
  }, [activeProject?.id]);

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    setAmount(inv ? invoiceBalance(inv) : 0);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const create = async () => {
    if (!invoiceId || !selectedInvoice?.po?.id) { toast.error('Select an invoice'); return; }
    if (!amount || amount <= 0)                  { toast.error('Enter a valid amount'); return; }

    // ✅ Block if this invoice already has an active payment request
    if (activePaymentInvoiceIds.has(invoiceId)) {
      toast.error('This invoice already has a pending or approved payment request');
      return;
    }

    setSubmitting(true);
    try {
      const pr = await api<{ id: string }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          poId:            selectedInvoice.po.id,
          amount,
          purpose:         `Invoice ${selectedInvoice.invoiceNumber}`,
          vendorInvoiceId: selectedInvoice.id,
        }),
      });
      await api(`/payments/${pr.id}/submit`, { method: 'POST' });
      toast.success('Payment request submitted');
      setInvoiceId('');
      setAmount(0);
      load();
      loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve ───────────────────────────────────────────────────────────────

  const approve = async (id: string) => {
    try {
      await api(`/payments/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ acknowledgeBreach: true }),
      });
      toast.success('Approved');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  // ── Execute ───────────────────────────────────────────────────────────────

  const execute = async () => {
    if (!utr.trim()) { toast.error('Enter UTR number'); return; }
    setExecuting(true);
    try {
      await api(`/payments/${approvedId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ utr }),
      });
      toast.success('Payment executed');
      setApprovedId('');
      setUtr('');
      load();
      loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to execute');
    } finally {
      setExecuting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/payments/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Payment request deleted');
      setDeleteTarget(null);
      load();
      loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const paidCount   = items.filter((i) => i.status === 'PAID').length;
  const unpaidCount = items.filter((i) => i.status !== 'PAID').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <style>{`
        .amount-locked-input {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: var(--ink) !important;
          -webkit-text-fill-color: var(--ink) !important;
          opacity: 1 !important;
          border: 1px solid var(--line) !important;
          border-radius: 7px !important;
          height: 36px !important;
          padding: 0 12px !important;
          width: 100% !important;
          box-shadow: none !important;
        }
      `}</style>
      <DeleteConfirmModal
        item={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />

      <PageHeader
        title="Payments"
        subtitle={
          activeProject
            ? `${activeProject.name} — payment requests & UTR execution`
            : 'Payment requests and UTR execution'
        }
      />

      {/* ── New payment request ── */}
      <Card className="mb-5">
        <CardHeader
          title="New Payment Request"
          subtitle="Select a vendor invoice"
        />
        <CardBody>
          {/* ── Row: Invoice selector + Amount + Submit ── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, maxWidth: 760, flex: '0 1 760px' }}>

            {/* Invoice selector */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Vendor Invoice *</label>
              <select value={invoiceId} onChange={(e) => handleInvoiceChange(e.target.value)}>
                <option value="">— select invoice —</option>
                {payableInvoices.map((inv) => {
                  const bal        = invoiceBalance(inv);
                  const hasActive  = activePaymentInvoiceIds.has(inv.id);
                  return (
                    <option key={inv.id} value={inv.id} disabled={hasActive}>
                      {inv.invoiceNumber}
                      {inv.po?.vendor?.name ? ` — ${inv.po.vendor.name}` : ''}
                      {hasActive
                        ? ' — payment pending'
                        : ` (balance: ${formatINR(bal)})`}
                    </option>
                  );
                })}
                {payableInvoices.length === 0 && (
                  <option disabled>All invoices are fully paid</option>
                )}
              </select>
            </div>

            {/* Amount — read-only once invoice is selected */}
            <div className="field" style={{ marginBottom: 0, width: 200, flexShrink: 0 }}>
              <label>Amount (₹)</label>
              <input
                type="number"
                value={amount || ''}
                placeholder="0"
                onChange={(e) => { if (!selectedInvoice) setAmount(+e.target.value); }}
                onKeyDown={(e) => { if (selectedInvoice) e.preventDefault(); }}
                className="amount-locked-input"
                style={{ fontWeight: 700, cursor: selectedInvoice ? 'not-allowed' : undefined }}
              />
            </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={
                !invoiceId ||
                !amount ||
                submitting ||
                activePaymentInvoiceIds.has(invoiceId)
              }
              style={{ whiteSpace: 'nowrap', height: 36, marginLeft: 'auto', flexShrink: 0 }}
            >
              {submitting
                ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Submitting…</>
                : <><Send style={{ width: 13, height: 13 }} /> Submit Request</>}
            </button>
          </div>
        </CardBody>
      </Card>

      {/* ── Execute payment (UTR entry) ── */}
      {approvedId && (
        <Card className="mb-5" style={{ borderLeft: '3px solid var(--green)' }}>
          <CardHeader
            title="Execute payment"
            subtitle="Enter the UTR number to mark this payment as executed"
          />
          <CardBody>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: 500 }}>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label>UTR number *</label>
                <input
                  placeholder="e.g. HDFC0000123456789"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={execute}
                  disabled={!utr.trim() || executing}
                >
                  {executing
                    ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Executing…</>
                    : <><Zap style={{ width: 13, height: 13 }} /> Execute payment</>}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setApprovedId(''); setUtr(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Payments table ── */}
      <Card>
        <CardHeader
          title="Payment History"
          subtitle={`${items.length} total · ${paidCount} paid · ${unpaidCount} unpaid`}
        />
        <CardBody className="p-0">
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>PO</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th>Payment Status</th>
                  <th>UTR</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const isPaid     = p.status === 'PAID';
                  const canDelete  = !isPaid; // allow delete for non-paid requests
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {p.vendorInvoice?.invoiceNumber ?? p.purpose ?? '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.po?.poNumber ?? '—'}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {p.po?.vendor?.name ?? '—'}
                      </td>
                      <td style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>
                        {p.createdAt ? formatDate(p.createdAt) : '—'}
                      </td>
                      <td className="right amt" style={{ fontWeight: 700 }}>
                        {formatINR(p.amount)}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px',
                          borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                          background: isPaid ? 'var(--success, #16a34a)' : 'var(--destructive, #dc2626)',
                          color: '#fff',
                        }}>
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>
                        {p.payment?.utr ?? '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                          {/* Approve button */}
                          {p.status === 'PENDING_APPROVAL' && user?.role !== 'PROJECT_HEAD' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 600 }}
                              onClick={() => approve(p.id)}
                            >
                              Approve
                            </button>
                          )}
                          {/* Execute button */}
                          {p.status === 'APPROVED' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600 }}
                              onClick={() => setApprovedId(p.id)}
                            >
                              <Zap style={{ width: 11, height: 11 }} /> Execute
                            </button>
                          )}
                          {/* Delete button — shown for all non-paid requests */}
                          {canDelete && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              title="Delete payment request"
                              style={{
                                background: 'none', border: '1px solid #fca5a5',
                                color: '#ef4444', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 style={{ width: 13, height: 13 }} />
                            </button>
                          )}
                          {/* Em-dash for paid rows with no actions */}
                          {isPaid && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>
                      No payment requests yet for this project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
