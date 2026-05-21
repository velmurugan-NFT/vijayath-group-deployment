/**
 * QuotationDetailPage — Steps 2 & 3
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { toast } from 'sonner';
import {
  Loader2, Plus, CheckCircle2, AlertTriangle,
  ArrowLeft, Trophy, Building2, Layers, Calendar,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Vendor { id: string; name: string }

interface SavedQuote {
  id: string;
  amount: number;
  deliveryDays?: number | null;
  isWinner: boolean;
  gstPct?: number | null;
  paymentTerms?: string | null;
  notes?: string | null;
  vendor: { id: string; name: string };
}

interface QRDetail {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  createdAt: string;
  winnerId?: string | null;
  winnerReason?: string | null;
  project: { id: string; name: string };
  lineItem?: { description: string } | null;
  quotations: SavedQuote[];
  requester?: { name: string } | null;
}

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string }> = {
  QUOTES_PENDING:  { label: 'Quotes pending',  cls: 'pill-warn'    },
  COMPARISON:      { label: 'Quotes received',  cls: 'pill-info'    },
  WINNER_SELECTED: { label: 'Winner selected',  cls: 'pill-success' },
  PO_CREATED:      { label: 'PO created',       cls: 'pill-success' },
  CANCELLED:       { label: 'Cancelled',        cls: 'pill-neutral' },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status.replace(/_/g, ' '), cls: 'pill-neutral' };
  return <span className={`pill ${m.cls}`}><span className="dot" />{m.label}</span>;
}

// ── Empty quote form ──────────────────────────────────────────────────────────
const emptyQuoteForm = () => ({
  vendorId:     '',
  amount:       '',
  deliveryDays: '',
  gstPct:       '',
  paymentTerms: '',
  notes:        '',
});

// ── Page ──────────────────────────────────────────────────────────────────────
export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [qr,           setQr]           = useState<QRDetail | null>(null);
  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [quoteForm,    setQuoteForm]    = useState(emptyQuoteForm());
  const [addingQuote,  setAddingQuote]  = useState(false);
  const [savingQuote,  setSavingQuote]  = useState(false);
  const [winnerId,     setWinnerId]     = useState('');
  const [winnerReason, setWinnerReason] = useState('');
  const [approvingSaving, setApprovingSaving] = useState(false);

  const load = () => {
    if (!id) return;
    api<QRDetail>(`/quotations/${id}`)
      .then((data) => {
        setQr(data);
        if (data.winnerId) { setWinnerId(data.winnerId); }
        if (data.winnerReason) { setWinnerReason(data.winnerReason); }
      })
      .catch(() => toast.error('Could not load quotation request'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api<Vendor[]>('/vendors').then(setVendors).catch(() => {});
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 8, color: 'var(--muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  if (!qr) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--muted)' }}>Quotation request not found.</p>
        <Link to="/quotations" className="btn btn-ghost" style={{ marginTop: 12 }}>← Back to list</Link>
      </div>
    );
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const quotes          = qr.quotations;
  const isSettled       = qr.status === 'PO_CREATED' || qr.status === 'WINNER_SELECTED';
  const lowestAmt       = quotes.length > 0 ? Math.min(...quotes.map((q) => q.amount)) : 0;
  const selQuote        = quotes.find((q) => q.id === winnerId);
  const isNonLowest     = selQuote != null && selQuote.amount > lowestAmt;
  const existingWinner  = quotes.find((q) => q.isWinner);

  const usedVendorIds    = new Set(quotes.map((q) => q.vendor.id));
  const availableVendors = vendors.filter((v) => !usedVendorIds.has(v.id));

  // ── Save a new vendor quote (Step 2) ─────────────────────────────────────
  const saveQuote = async () => {
    if (!quoteForm.vendorId)  { toast.error('Select a vendor'); return; }
    if (!quoteForm.amount)    { toast.error('Enter the quote amount'); return; }
    setSavingQuote(true);
    try {
      await api(`/quotations/${qr.id}/quotes`, {
        method: 'POST',
        body: JSON.stringify({
          vendorId:     quoteForm.vendorId,
          amount:       Number(quoteForm.amount),
          deliveryDays: quoteForm.deliveryDays ? Number(quoteForm.deliveryDays) : undefined,
          gstPct:       quoteForm.gstPct       ? Number(quoteForm.gstPct)       : undefined,
          paymentTerms: quoteForm.paymentTerms  || undefined,
          notes:        quoteForm.notes         || undefined,
        }),
      });
      toast.success('Quote saved');
      setQuoteForm(emptyQuoteForm());
      setAddingQuote(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSavingQuote(false);
    }
  };

  // ── Approve winner → create PO (Step 3) ──────────────────────────────────
  const approveWinner = async () => {
    if (!winnerId) { toast.error('Select a vendor first'); return; }
    if (isNonLowest && !winnerReason.trim()) {
      toast.error('A reason is required when selecting a higher-priced vendor');
      return;
    }
    setApprovingSaving(true);
    try {
      const res = await api<{ purchaseOrder: { id: string; poNumber: string } }>(
        `/quotations/${qr.id}/select-winner`,
        { method: 'POST', body: JSON.stringify({ quotationId: winnerId, reason: winnerReason || undefined }) },
      );
      toast.success(`✓ Approved — PO ${res.purchaseOrder.poNumber} created`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApprovingSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={qr.title}
        subtitle={`${qr.project.name}${qr.lineItem ? ' · ' + qr.lineItem.description : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusPill status={qr.status} />
            <Link to="/quotations" className="btn btn-ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
          </div>
        }
      />

      {/* ── Request summary ── */}
      <Card className="mb-4">
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16 }}>
            <div>
              <div style={metaLabel}>Project</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.875rem', fontWeight: 600 }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                {qr.project.name}
              </div>
            </div>
            <div>
              <div style={metaLabel}>Budget line</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.875rem' }}>
                <Layers className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                {qr.lineItem?.description ?? '—'}
              </div>
            </div>
            <div>
              <div style={metaLabel}>Created</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.875rem' }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                {formatDate(qr.createdAt)}
              </div>
            </div>
            {qr.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={metaLabel}>Description</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)' }}>{qr.description}</div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Vendor quotes
          ════════════════════════════════════════════════════════════════════ */}
      <Card className="mb-4">
        <CardHeader
          title={`Step 2 — Vendor quotes (${quotes.length})`}
          subtitle="Add one quote per vendor. All quotes are saved here."
          actions={
            !isSettled && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { setAddingQuote((v) => !v); setQuoteForm(emptyQuoteForm()); }}
              >
                <Plus className="w-3.5 h-3.5" />
                {addingQuote ? 'Cancel' : 'Add vendor quote'}
              </button>
            )
          }
        />

        {/* Add quote form */}
        {addingQuote && !isSettled && (
          <div style={{
            margin: '0 1rem 1rem',
            padding: '1rem',
            background: 'var(--surface-2)',
            borderRadius: 8,
            border: '1px solid var(--line)',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              New vendor quote
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Vendor *</label>
                <select
                  value={quoteForm.vendorId}
                  onChange={(e) => setQuoteForm({ ...quoteForm, vendorId: e.target.value })}
                >
                  <option value="">— select —</option>
                  {availableVendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                  {availableVendors.length === 0 && vendors.length > 0 && (
                    <option disabled>All vendors already quoted</option>
                  )}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Amount (₹) *</label>
                <input
                  type="number" min="0" placeholder="0"
                  value={quoteForm.amount}
                  onChange={(e) => setQuoteForm({ ...quoteForm, amount: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Delivery (days)</label>
                <input
                  type="number" min="1" placeholder="30"
                  value={quoteForm.deliveryDays}
                  onChange={(e) => setQuoteForm({ ...quoteForm, deliveryDays: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>GST %</label>
                <input
                  type="number" min="0" max="100" placeholder="18"
                  value={quoteForm.gstPct}
                  onChange={(e) => setQuoteForm({ ...quoteForm, gstPct: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Payment terms</label>
                <input
                  placeholder="e.g. 50% advance"
                  value={quoteForm.paymentTerms}
                  onChange={(e) => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginTop: 5, marginBottom: 0 }}>
                <label>Notes</label>
                <textarea
                  placeholder="Enter quotation remarks..."
                  value={quoteForm.notes}
                  onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                  rows={4}
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '10px',
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button" className="btn btn-primary"
                disabled={savingQuote || !quoteForm.vendorId || !quoteForm.amount}
                onClick={saveQuote}
              >
                {savingQuote
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  : <><Plus className="w-3.5 h-3.5" /> Save quote</>
                }
              </button>
              <button
                type="button" className="btn btn-ghost"
                onClick={() => { setAddingQuote(false); setQuoteForm(emptyQuoteForm()); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Saved quotes table */}
        <CardBody className="p-0">
          {quotes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem', fontSize: '0.875rem' }}>
              No vendor quotes yet. Click "Add vendor quote" to start capturing quotes.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 380 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {/* Checkbox column header — only shown when not settled */}
                    {!isSettled && (
                      <th style={{ width: 40, textAlign: 'center' }}>Select</th>
                    )}
                    <th>Vendor</th>
                    <th className="right">Amount</th>
                    <th className="right">GST %</th>
                    <th className="right">Delivery (days)</th>
                    <th>Payment terms</th>
                    <th>Notes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const isLowest   = q.amount === lowestAmt && quotes.length > 1;
                    const isChecked  = winnerId === q.id;
                    return (
                      <tr
                        key={q.id}
                        style={{
                          background: q.isWinner
                            ? 'var(--green-50)'
                            : isChecked
                            ? 'var(--surface-2)'
                            : undefined,
                          // keep pointer only on the data cells, not the checkbox cell
                        }}
                      >
                        {/* ── Checkbox cell ── */}
                        {!isSettled && (
                          <td
                            style={{ textAlign: 'center', verticalAlign: 'middle' }}
                            // stop row-click propagation if any parent has onClick
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                // act as a radio: clicking an already-checked box deselects
                                setWinnerId(isChecked ? '' : q.id);
                                if (isChecked) setWinnerReason('');
                              }}
                              style={{
                                width: 16,
                                height: 16,
                                accentColor: 'var(--primary)',
                                cursor: 'pointer',
                              }}
                            />
                          </td>
                        )}

                        <td className="name-cell" style={{ fontWeight: 600 }}>
                          {q.isWinner && (
                            <Trophy className="w-3.5 h-3.5 inline mr-1" style={{ color: 'var(--gold)' }} />
                          )}
                          {q.vendor.name}
                        </td>
                        <td className="right amt" style={{ fontWeight: 700 }}>
                          {formatINR(q.amount)}
                          {isLowest && (
                            <span style={{ marginLeft: 6, fontSize: '0.68rem', background: 'var(--success-soft)', color: 'var(--success)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              Lowest
                            </span>
                          )}
                        </td>
                        <td className="right">{q.gstPct != null ? `${q.gstPct}%` : '—'}</td>
                        <td className="right">{q.deliveryDays ?? '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{q.paymentTerms ?? '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{q.notes ?? '—'}</td>
                        <td>
                          {q.isWinner ? (
                            <span className="pill pill-success"><span className="dot" />Winner</span>
                          ) : isChecked && !isSettled ? (
                            <span className="pill pill-info"><span className="dot" />Selected</span>
                          ) : (
                            <span className="pill pill-neutral"><span className="dot" />Quoted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Select vendor & approve → create PO
          ════════════════════════════════════════════════════════════════════ */}
      {!isSettled && quotes.length > 0 && (
        <Card className="mb-4" style={{ borderLeft: `3px solid ${winnerId ? (isNonLowest ? 'var(--warning)' : 'var(--green)') : 'var(--line)'}` }}>
          <CardHeader
            title="Step 3 — Select vendor &amp; approve"
            subtitle={winnerId ? `Selected: ${selQuote?.vendor.name} · ${formatINR(selQuote!.amount)}` : 'Tick a checkbox above to select a vendor, then approve below'}
          />
          <CardBody>
            {!winnerId ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                ← Tick the checkbox next to the vendor you want to approve.
              </p>
            ) : (
              <>
                {/* Non-lowest warning + reason */}
                {isNonLowest && (
                  <div style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                    color: 'var(--warning)', fontSize: '0.875rem',
                  }}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Higher price selected</strong> — {selQuote!.vendor.name}'s quote of{' '}
                      {formatINR(selQuote!.amount)} is above the lowest quote of {formatINR(lowestAmt)}.
                      A reason is required.
                    </div>
                  </div>
                )}

                <div className="field" style={{ maxWidth: 500, marginBottom: 14 }}>
                  <label style={{ color: isNonLowest ? 'var(--danger)' : undefined }}>
                    {isNonLowest ? 'Reason for selecting higher-price vendor *' : 'Reason / notes (optional)'}
                  </label>
                  <input
                    placeholder={isNonLowest
                      ? 'e.g. Better delivery timeline, past performance, product quality…'
                      : 'e.g. Best overall value…'}
                    value={winnerReason}
                    onChange={(e) => setWinnerReason(e.target.value)}
                    style={{ borderColor: isNonLowest && !winnerReason.trim() ? 'var(--danger)' : undefined }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button" className="btn btn-primary"
                    disabled={approvingSaving || (isNonLowest && !winnerReason.trim())}
                    onClick={approveWinner}
                  >
                    {approvingSaving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving…</>
                      : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; create PO</>
                    }
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setWinnerId(''); setWinnerReason(''); }}>
                    Clear selection
                  </button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* Settled state — show winner + PO link */}
      {isSettled && existingWinner && (
        <Card className="mb-4" style={{ borderLeft: '3px solid var(--green)' }}>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Trophy className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Approved: {existingWinner.vendor.name}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                {formatINR(existingWinner.amount)}
              </span>
            </div>
            {qr.winnerReason && (
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: 12 }}>
                <strong>Reason:</strong> {qr.winnerReason}
              </p>
            )}
            <Link to="/quotations" className="btn btn-primary btn-sm">
              View Purchase Orders →
            </Link>
          </CardBody>
        </Card>
      )}

      <Link to="/quotations" className="btn btn-link btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to POs &amp; Quotes
      </Link>
    </div>
  );
}

const metaLabel: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
};
