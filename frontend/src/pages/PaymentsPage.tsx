import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { StatusBadge } from '@/components/StatusBadge';
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
  po?: {
    id: string;
    poNumber: string;
    vendor?: { name: string };
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { user } = useAuth();
  const pq = useProjectQuery();
  const { activeProject } = useProjectContext();

  const [items, setItems]           = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices]     = useState<VendorInvoice[]>([]);
  const [invoiceId, setInvoiceId]   = useState('');
  const [amount, setAmount]         = useState(0);
  const [utr, setUtr]               = useState('');
  const [approvedId, setApprovedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [executing, setExecuting]   = useState(false);

  // Derived: resolve poId from the selected invoice
  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId) ?? null;

  const load = () =>
    api<Record<string, unknown>[]>(`/payments${pq}`).then(setItems);

  useEffect(() => {
    load();
    api<VendorInvoice[]>(`/vendor-invoices${pq}`).then(setInvoices);
  }, [pq]);

  // Reset selection when project switches
  useEffect(() => {
    setInvoiceId('');
    setAmount(0);
  }, [activeProject?.id]);

  const create = async () => {
    if (!invoiceId || !selectedInvoice?.po?.id) return;
    setSubmitting(true);
    try {
      const pr = await api<{ id: string }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          poId: selectedInvoice.po.id,
          amount,
          purpose: `Invoice ${selectedInvoice.invoiceNumber}`,
        }),
      });
      await api(`/payments/${pr.id}/submit`, { method: 'POST' });
      toast.success('Payment request submitted');
      setInvoiceId('');
      setAmount(0);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

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

  const execute = async () => {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to execute');
    } finally {
      setExecuting(false);
    }
  };

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
          title="New payment request"
          subtitle="Select a vendor invoice and enter the amount to submit a payment request"
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 640 }}>

            {/* ── Invoice selector ── */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Vendor Invoice *</label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              >
                <option value="">— select invoice —</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber}
                    {inv.po?.vendor?.name ? ` — ${inv.po.vendor.name}` : ''}
                  </option>
                ))}
                {invoices.length === 0 && (
                  <option disabled>No invoices found for this project</option>
                )}
              </select>
            </div>

            {/* ── Amount — fully manual ── */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Amount (₹) *</label>
              <input
                type="number"
                min="1"
                value={amount || ''}
                placeholder="0"
                onChange={(e) => setAmount(+e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={!invoiceId || !amount || submitting}
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
          title="Payment history"
          subtitle={`${items.length} payment${items.length !== 1 ? 's' : ''} · all statuses`}
        />
        <CardBody className="p-0">
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Vendor</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={String(p.id)}>
                    <td className="name-cell" style={{ fontWeight: 600 }}>
                      {(p.po as { poNumber: string })?.poNumber ?? '—'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {((p.po as { vendor?: { name: string } })?.vendor?.name) ?? '—'}
                    </td>
                    <td className="right amt" style={{ fontWeight: 700 }}>
                      {formatINR(p.amount as number)}
                    </td>
                    <td>
                      <StatusBadge status={String(p.status)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {p.status === 'PENDING_APPROVAL' && user?.role !== 'PROJECT_HEAD' && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              background: 'var(--success)',
                              color: '#fff',
                              border: 'none',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={() => approve(String(p.id))}
                          >
                            Approve
                          </button>
                        )}
                        {p.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={() => setApprovedId(String(p.id))}
                          >
                            <Zap style={{ width: 11, height: 11 }} /> Execute
                          </button>
                        )}
                        {!['PENDING_APPROVAL', 'APPROVED'].includes(String(p.status)) && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>
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
