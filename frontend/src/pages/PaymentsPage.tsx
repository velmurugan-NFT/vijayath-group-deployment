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
import { Loader2, Send, Zap } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type VendorInvoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  // ✅ These are computed by the backend from PaymentRequest → Payment
  // (NOT from VendorInvoicePayment which is a separate sub-system)
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
  vendorInvoice?: { invoiceNumber: string };
  payment?: { utr: string; paidAt: string };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// paidAmount and isPaid come directly from the backend (computed via
// PaymentRequest → Payment, which is the real payment trail).

function paidAmount(inv: VendorInvoice): number {
  return Number(inv.paidAmount ?? 0);
}

function invoiceBalance(inv: VendorInvoice): number {
  return Math.max(0, Number(inv.amount) - paidAmount(inv));
}

function isFullyPaid(inv: VendorInvoice): boolean {
  return inv.isPaid === true;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { user } = useAuth();
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items,      setItems]      = useState<PaymentItem[]>([]);
  const [invoices,   setInvoices]   = useState<VendorInvoice[]>([]);
  const [invoiceId,  setInvoiceId]  = useState('');
  const [amount,     setAmount]     = useState(0);
  const [utr,        setUtr]        = useState('');
  const [approvedId, setApprovedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [executing,  setExecuting]  = useState(false);

  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId) ?? null;

  // ── Derived: split invoices into payable vs fully paid ───────────────────

  const payableInvoices   = invoices.filter((inv) => !isFullyPaid(inv));
  const fullyPaidCount    = invoices.filter((inv) =>  isFullyPaid(inv)).length;

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

  // When invoice selected, auto-fill its remaining balance (not full amount)
  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    // Pre-fill with remaining balance so user pays what's left
    setAmount(inv ? invoiceBalance(inv) : 0);
  };

  // ── Submit: create + submit payment request ───────────────────────────────

  const create = async () => {
    if (!invoiceId || !selectedInvoice?.po?.id) { toast.error('Select an invoice'); return; }
    if (!amount || amount <= 0)                  { toast.error('Enter a valid amount'); return; }

    const balance = invoiceBalance(selectedInvoice);
    if (amount > balance) {
      toast.error(`Amount exceeds remaining balance of ${formatINR(balance)}`);
      return;
    }

    setSubmitting(true);
    try {
      const pr = await api<{ id: string }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          poId:    selectedInvoice.po.id,
          amount,
          purpose: `Invoice ${selectedInvoice.invoiceNumber}`,
        }),
      });
      await api(`/payments/${pr.id}/submit`, { method: 'POST' });
      toast.success('Payment request submitted');
      setInvoiceId('');
      setAmount(0);
      load();
      loadInvoices(); // ✅ refresh so paid invoices disappear from dropdown
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
      loadInvoices(); // ✅ refresh so invoice disappears from dropdown once fully paid
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to execute');
    } finally {
      setExecuting(false);
    }
  };

  // ── Paid / Unpaid counts ──────────────────────────────────────────────────

  const paidCount   = items.filter((i) => i.status === 'PAID').length;
  const unpaidCount = items.filter((i) => i.status !== 'PAID').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
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
          title="New payment Request"
          subtitle="select a vendor invoice"
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, maxWidth: 680 }}>

            {/* Invoice selector — ✅ only payableInvoices shown */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Vendor Invoice *</label>
              <select value={invoiceId} onChange={(e) => handleInvoiceChange(e.target.value)}>
                <option value="">— select invoice —</option>
                {payableInvoices.map((inv) => {
                  const bal = invoiceBalance(inv);
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber}
                      {inv.po?.vendor?.name ? ` — ${inv.po.vendor.name}` : ''}
                      {` (balance: ${formatINR(bal)})`}
                    </option>
                  );
                })}
                {payableInvoices.length === 0 && (
                  <option disabled>All invoices are fully paid</option>
                )}
              </select>

              {/* ✅ Hint showing how many invoices are hidden because fully paid */}
              {fullyPaidCount > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {fullyPaidCount} invoice{fullyPaidCount > 1 ? 's' : ''} 
                </p>
              )}
            </div>

            {/* Amount — pre-filled with remaining balance, still editable */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Amount (₹) *</label>
              <input
                type="number"
                min="1"
                max={selectedInvoice ? invoiceBalance(selectedInvoice) : undefined}
                value={amount || ''}
                placeholder="0"
                onChange={(e) => setAmount(+e.target.value)}
                style={
                  selectedInvoice && amount > invoiceBalance(selectedInvoice)
                    ? { borderColor: 'var(--destructive)' }
                    : {}
                }
              />
            </div>
          </div>

          {/* Invoice summary card */}
          {selectedInvoice && (
            <div
              style={{
                marginTop: 12,
                maxWidth: 460,
                background: 'var(--muted)',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: '0.83rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
              }}
            >
              <div>
                <div style={{ color: 'var(--muted-foreground)', marginBottom: 2 }}>Invoice Total</div>
                <div style={{ fontWeight: 700 }}>{formatINR(selectedInvoice.amount)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--muted-foreground)', marginBottom: 2 }}>Already Paid</div>
                <div style={{ fontWeight: 700, color: 'var(--success, #16a34a)' }}>
                  {formatINR(paidAmount(selectedInvoice))}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--muted-foreground)', marginBottom: 2 }}>Balance</div>
                <div style={{ fontWeight: 700, color: '#d97706' }}>
                  {formatINR(invoiceBalance(selectedInvoice))}
                </div>
              </div>
              {selectedInvoice.po && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: 'var(--muted-foreground)', marginBottom: 2 }}>PO</div>
                  <div style={{ fontWeight: 600 }}>
                    {selectedInvoice.po.poNumber}
                    {selectedInvoice.po.vendor?.name && ` · ${selectedInvoice.po.vendor.name}`}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedInvoice && amount > invoiceBalance(selectedInvoice) && (
            <p style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: 6 }}>
              Amount exceeds remaining balance of {formatINR(invoiceBalance(selectedInvoice))}
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={
                !invoiceId ||
                !amount ||
                (!!selectedInvoice && amount > invoiceBalance(selectedInvoice)) ||
                submitting
              }
            >
              {submitting ? (
                <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Submitting…</>
              ) : (
                <><Send style={{ width: 13, height: 13 }} /> Submit request</>
              )}
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
                  {executing ? (
                    <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Executing…</>
                  ) : (
                    <><Zap style={{ width: 13, height: 13 }} /> Execute payment</>
                  )}
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
                  const isPaid = p.status === 'PAID';
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {p.vendorInvoice?.invoiceNumber ?? p.purpose ?? '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {p.po?.poNumber ?? '—'}
                      </td>
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
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: 999,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isPaid ? 'var(--success, #16a34a)' : 'var(--destructive, #dc2626)',
                            color: '#fff',
                          }}
                        >
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>
                        {p.payment?.utr ?? '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
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
                          {!['PENDING_APPROVAL', 'APPROVED'].includes(p.status) && (
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
