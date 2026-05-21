/**
 * PendingQuotationsPage
 *
 * Unified page for all pending quotation requests — both freshly created
 * (QUOTES_PENDING / no vendor quotes yet) and those already gathering quotes
 * (COMPARISON). Users can:
 *   • See every pending QR in one table
 *   • Expand any row to add vendor quotes inline
 *   • Select a vendor and approve → creates PO
 *
 * Route: /pending-quotations
 * Add to App.tsx:  <Route path="pending-quotations" element={<PendingQuotationsPage />} />
 */

import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/design/Card';
import { useProjectContext } from '@/context/ProjectContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Loader2, Plus, ChevronDown, ChevronRight, FolderOpen,
  PlusCircle, Trophy, AlertTriangle, CheckCircle2, Package,
  Clock, FileText,
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

interface QR {
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

const emptyQuoteForm = () => ({
  vendorId: '',
  amount: '',
  deliveryDays: '',
  gstPct: '',
  paymentTerms: '',
  notes: '',
});

// ── Status meta ────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  QUOTES_PENDING: { label: 'Awaiting quotes', cls: 'pill-warn',    icon: Clock   },
  COMPARISON:     { label: 'Comparing quotes', cls: 'pill-info',   icon: FileText },
  DRAFT:          { label: 'Draft',            cls: 'pill-neutral', icon: FileText },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status.replace(/_/g, ' '), cls: 'pill-neutral', icon: FileText };
  const Icon = m.icon;
  return (
    <span className={`pill ${m.cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon style={{ width: 11, height: 11 }} />
      {m.label}
    </span>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────
function QRRow({ qr, vendors, onRefresh }: { qr: QR; vendors: Vendor[]; onRefresh: () => void }) {
  const [expanded,     setExpanded]     = useState(false);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [quoteForm,    setQuoteForm]    = useState(emptyQuoteForm());
  const [savingQuote,  setSavingQuote]  = useState(false);
  const [winnerId,     setWinnerId]     = useState('');
  const [winnerReason, setWinnerReason] = useState('');
  const [approving,    setApproving]    = useState(false);

  const quotes       = qr.quotations;
  const lowestAmt    = quotes.length > 0 ? Math.min(...quotes.map((q) => q.amount)) : 0;
  const selQuote     = quotes.find((q) => q.id === winnerId);
  const isNonLowest  = selQuote != null && selQuote.amount > lowestAmt;
  const usedVendors  = new Set(quotes.map((q) => q.vendor.id));
  const available    = vendors.filter((v) => !usedVendors.has(v.id));

  const saveQuote = async () => {
    if (!quoteForm.vendorId) { toast.error('Select a vendor'); return; }
    if (!quoteForm.amount)   { toast.error('Enter the quote amount'); return; }
    setSavingQuote(true);
    try {
      await api(`/quotations/${qr.id}/quotes`, {
        method: 'POST',
        body: JSON.stringify({
          vendorId:     quoteForm.vendorId,
          amount:       Number(quoteForm.amount),
          deliveryDays: quoteForm.deliveryDays ? Number(quoteForm.deliveryDays) : undefined,
          gstPct:       quoteForm.gstPct       ? Number(quoteForm.gstPct)       : undefined,
          paymentTerms: quoteForm.paymentTerms || undefined,
          notes:        quoteForm.notes        || undefined,
        }),
      });
      toast.success('Quote saved');
      setQuoteForm(emptyQuoteForm());
      setShowAddForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSavingQuote(false);
    }
  };

  const approveWinner = async () => {
    if (!winnerId) { toast.error('Select a vendor first'); return; }
    if (isNonLowest && !winnerReason.trim()) {
      toast.error('A reason is required when selecting a higher-priced vendor');
      return;
    }
    setApproving(true);
    try {
      const res = await api<{ purchaseOrder: { id: string; poNumber: string } }>(
        `/quotations/${qr.id}/select-winner`,
        { method: 'POST', body: JSON.stringify({ quotationId: winnerId, reason: winnerReason || undefined }) },
      );
      toast.success(`✓ Approved — PO ${res.purchaseOrder.poNumber} created`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  return (
    <>
      {/* ── Summary row ── */}
      <tr
        style={{ cursor: 'pointer', background: expanded ? 'var(--surface-2)' : undefined }}
        onClick={() => setExpanded((v) => !v)}
      >
        <td style={{ width: 32, paddingRight: 0 }}>
          {expanded
            ? <ChevronDown  style={{ width: 15, height: 15, color: 'var(--muted)' }} />
            : <ChevronRight style={{ width: 15, height: 15, color: 'var(--muted)' }} />
          }
        </td>
        <td style={{ fontWeight: 600 }}>
          {qr.title}
          <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 1 }}>
            {qr.project.name}
            {qr.lineItem && <> · {qr.lineItem.description}</>}
          </div>
        </td>
        <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{formatDate(qr.createdAt)}</td>
        <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
          {quotes.length > 0
            ? <span style={{ fontWeight: 600 }}>{quotes.length} vendor{quotes.length !== 1 ? 's' : ''}</span>
            : <span style={{ color: 'var(--muted)' }}>No quotes yet</span>
          }
        </td>
        <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
          {quotes.length > 0 ? (
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{formatINR(lowestAmt)}</span>
          ) : '—'}
        </td>
        <td><StatusPill status={qr.status} /></td>
        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ fontSize: '0.76rem' }}
            onClick={() => { setExpanded(true); setShowAddForm(true); }}
          >
            <Plus style={{ width: 12, height: 12 }} /> Add quote
          </button>
        </td>
      </tr>

      {/* ── Expanded panel ── */}
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: 0, background: 'var(--surface-2)', borderBottom: '2px solid var(--gold)' }}>
            <div style={{ padding: '1rem 1.25rem 1.25rem', borderLeft: '3px solid var(--gold)' }}>

              {/* Add vendor quote form */}
              {showAddForm && (
                <div style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '1rem',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Add vendor quote
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Vendor *</label>
                      <select
                        value={quoteForm.vendorId}
                        onChange={(e) => setQuoteForm({ ...quoteForm, vendorId: e.target.value })}
                      >
                        <option value="">— select —</option>
                        {available.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        {available.length === 0 && vendors.length > 0 && (
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
                        placeholder="e.g. 30% advance"
                        value={quoteForm.paymentTerms}
                        onChange={(e) => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Notes</label>
                      <input
                        placeholder="Any remarks…"
                        value={quoteForm.notes}
                        onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button" className="btn btn-primary btn-sm"
                      disabled={savingQuote || !quoteForm.vendorId || !quoteForm.amount}
                      onClick={saveQuote}
                    >
                      {savingQuote
                        ? <><Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Saving…</>
                        : <><Plus style={{ width: 12, height: 12 }} /> Save quote</>
                      }
                    </button>
                    <button
                      type="button" className="btn btn-ghost btn-sm"
                      onClick={() => { setShowAddForm(false); setQuoteForm(emptyQuoteForm()); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Quotes table */}
              {quotes.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: 'var(--muted)', padding: '1.5rem',
                  fontSize: '0.875rem', background: 'var(--surface-1)', borderRadius: 8,
                  border: '1px dashed var(--line)',
                }}>
                  No vendor quotes yet.{' '}
                  <button
                    type="button"
                    className="btn btn-link btn-sm"
                    onClick={() => setShowAddForm(true)}
                    style={{ display: 'inline', padding: 0 }}
                  >
                    Add the first quote →
                  </button>
                </div>
              ) : (
                <>
                  <table className="tbl" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 28 }}></th>
                        <th>Vendor</th>
                        <th className="right">Amount</th>
                        <th className="right">GST %</th>
                        <th className="right">Delivery</th>
                        <th>Payment terms</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => {
                        const isLowest   = q.amount === lowestAmt && quotes.length > 1;
                        const isSelected = winnerId === q.id;
                        return (
                          <tr
                            key={q.id}
                            style={{
                              cursor: 'pointer',
                              background: isSelected
                                ? 'var(--green-50, rgba(34,197,94,0.08))'
                                : undefined,
                              outline: isSelected ? '2px solid var(--green)' : undefined,
                              outlineOffset: -2,
                            }}
                            onClick={() => setWinnerId((prev) => prev === q.id ? '' : q.id)}
                          >
                            <td style={{ paddingRight: 0 }}>
                              <div style={{
                                width: 16, height: 16,
                                borderRadius: '50%',
                                border: `2px solid ${isSelected ? 'var(--green)' : 'var(--line)'}`,
                                background: isSelected ? 'var(--green)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {isSelected && (
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {q.vendor.name}
                            </td>
                            <td className="right amt" style={{ fontWeight: 700 }}>
                              {formatINR(q.amount)}
                              {isLowest && (
                                <span style={{
                                  marginLeft: 6, fontSize: '0.68rem',
                                  background: 'var(--success-soft)', color: 'var(--success)',
                                  padding: '1px 5px', borderRadius: 4, fontWeight: 600,
                                }}>
                                  Lowest
                                </span>
                              )}
                            </td>
                            <td className="right" style={{ fontSize: '0.82rem' }}>
                              {q.gstPct != null ? `${q.gstPct}%` : '—'}
                            </td>
                            <td className="right" style={{ fontSize: '0.82rem' }}>
                              {q.deliveryDays ? `${q.deliveryDays}d` : '—'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                              {q.paymentTerms ?? '—'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                              {q.notes ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Approve panel */}
                  {quotes.length >= 1 && (
                    <div style={{
                      marginTop: 14,
                      padding: '0.875rem 1rem',
                      background: winnerId
                        ? (isNonLowest ? 'var(--warning-soft, rgba(245,158,11,0.08))' : 'var(--green-50, rgba(34,197,94,0.08))')
                        : 'var(--surface-1)',
                      border: `1px solid ${winnerId ? (isNonLowest ? 'var(--warning)' : 'var(--green)') : 'var(--line)'}`,
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      {!winnerId ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
                          ↑ Click a vendor row above to select them for approval.
                        </p>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Trophy style={{ width: 15, height: 15, color: 'var(--gold)' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                              Selected: {selQuote?.vendor.name}
                            </span>
                            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                              {formatINR(selQuote!.amount)}
                            </span>
                          </div>

                          {isNonLowest && (
                            <div style={{
                              display: 'flex', gap: 8, alignItems: 'flex-start',
                              background: 'var(--warning-soft, rgba(245,158,11,0.1))',
                              border: '1px solid var(--warning)',
                              borderRadius: 6, padding: '8px 12px',
                              color: 'var(--warning)', fontSize: '0.8rem',
                            }}>
                              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <strong>Higher price selected</strong> — {selQuote!.vendor.name}'s quote is above the lowest ({formatINR(lowestAmt)}). A reason is required.
                              </div>
                            </div>
                          )}

                          <div className="field" style={{ maxWidth: 460, marginBottom: 0 }}>
                            <label style={{ color: isNonLowest ? 'var(--danger)' : undefined }}>
                              {isNonLowest ? 'Reason for selecting higher-price vendor *' : 'Reason / notes (optional)'}
                            </label>
                            <input
                              placeholder={isNonLowest
                                ? 'e.g. Better delivery timeline, past performance…'
                                : 'e.g. Best overall value…'}
                              value={winnerReason}
                              onChange={(e) => setWinnerReason(e.target.value)}
                              style={{ borderColor: isNonLowest && !winnerReason.trim() ? 'var(--danger)' : undefined }}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button" className="btn btn-primary btn-sm"
                              disabled={approving || (isNonLowest && !winnerReason.trim())}
                              onClick={approveWinner}
                            >
                              {approving
                                ? <><Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Approving…</>
                                : <><CheckCircle2 style={{ width: 12, height: 12 }} /> Approve &amp; create PO</>
                              }
                            </button>
                            <button
                              type="button" className="btn btn-ghost btn-sm"
                              onClick={() => { setWinnerId(''); setWinnerReason(''); }}
                            >
                              Clear
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function PendingQuotationsPage() {
  const { projects, activeProject, setActiveProjectId, loading: projectsLoading } = useProjectContext();
  const [allRequests, setAllRequests] = useState<QR[]>([]);
  const [vendors,     setVendors]     = useState<Vendor[]>([]);
  const [loading,     setLoading]     = useState(false);

  const pid = activeProject?.id ?? '';

  const load = () => {
    if (!pid) { setAllRequests([]); return; }
    setLoading(true);
    api<QR[]>(`/quotations?projectId=${pid}`)
      .then((data) => {
        // Show only pending statuses — QUOTES_PENDING and COMPARISON
        setAllRequests(data.filter((r) => r.status === 'QUOTES_PENDING' || r.status === 'COMPARISON' || r.status === 'DRAFT'));
      })
      .catch(() => setAllRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [pid]);
  useEffect(() => { api<Vendor[]>('/vendors').then(setVendors).catch(() => {}); }, []);

  const awaitingQuotes = allRequests.filter((r) => r.status === 'QUOTES_PENDING' || r.status === 'DRAFT');
  const comparing      = allRequests.filter((r) => r.status === 'COMPARISON');

  if (projectsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 8, color: 'var(--muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading projects…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pending Quotations"
        subtitle={pid
          ? `${activeProject?.name} · ${allRequests.length} pending`
          : 'All quotation requests awaiting quotes or approval'
        }
        // actions={
        //   <Link to="/capture-quotes" className="btn btn-primary">
        //     <PlusCircle className="w-3.5 h-3.5" /> New quotation request
        //   </Link>
        // }
      />

      ── Project selector ──
      <Card className="mb-4" style={{ borderLeft: '3px solid var(--gold)' }}>
        <CardBody style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Project:</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {projects.map((p) => (
                <button
                  key={p.id} type="button"
                  onClick={() => setActiveProjectId(p.id)}
                  className={cn('btn btn-sm', pid === p.id ? 'btn-primary' : 'btn-ghost')}
                  style={{ fontSize: '0.8rem' }}
                >
                  {p.name}{pid === p.id && <span style={{ marginLeft: 4 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {!pid && (
        <Card>
          <CardBody>
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
              ↑ Select a project above to view pending quotations.
            </p>
          </CardBody>
        </Card>
      )}

      {pid && loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: 8, color: 'var(--muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {pid && !loading && (
        <>
          {/* ── Summary counters ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total pending',    value: allRequests.length,    icon: Package,     color: 'var(--ink)'     },
              { label: 'Awaiting quotes',  value: awaitingQuotes.length, icon: Clock,       color: 'var(--warning)' },
              { label: 'Ready to approve', value: comparing.length,      icon: CheckCircle2, color: 'var(--green)'  },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} style={{ borderTop: `3px solid ${color}` }}>
                <CardBody style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon style={{ width: 20, height: 20, color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, color }}>{value}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {allRequests.length === 0 ? (
            <Card>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  <Package style={{ width: 36, height: 36, margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.9rem' }}>No pending quotation requests for this project.</p>
                  <Link to="/capture-quotes" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                    <PlusCircle className="w-3.5 h-3.5" /> Create one →
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="p-0">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Quotation request</th>
                      <th>Created</th>
                      <th className="right">Vendor quotes</th>
                      <th className="right">Lowest quote</th>
                      <th>Status</th>
                      <th className="right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Section: Awaiting quotes ── */}
                    {awaitingQuotes.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={7} style={{
                            background: 'var(--surface-2)',
                            padding: '6px 12px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--warning)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            borderBottom: '1px solid var(--line)',
                          }}>
                            <Clock style={{ width: 11, height: 11, display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                            Awaiting vendor quotes — {awaitingQuotes.length}
                          </td>
                        </tr>
                        {awaitingQuotes.map((qr) => (
                          <QRRow key={qr.id} qr={qr} vendors={vendors} onRefresh={load} />
                        ))}
                      </>
                    )}

                    {/* ── Section: Ready to compare / approve ── */}
                    {comparing.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={7} style={{
                            background: 'var(--surface-2)',
                            padding: '6px 12px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--green)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            borderBottom: '1px solid var(--line)',
                          }}>
                            <CheckCircle2 style={{ width: 11, height: 11, display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                            Quotes received — ready to compare &amp; approve — {comparing.length}
                          </td>
                        </tr>
                        {comparing.map((qr) => (
                          <QRRow key={qr.id} qr={qr} vendors={vendors} onRefresh={load} />
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
