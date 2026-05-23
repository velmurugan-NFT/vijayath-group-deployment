/**
 * QuotationDetailPage — Steps 2 & 3
 * Added: Edit & Delete for the Quotation Request and for each vendor quote.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { toast } from 'sonner';
import {
  Loader2, Plus, CheckCircle2, AlertTriangle,
  ArrowLeft, Trophy, Building2, Layers, Calendar,
  Pencil, Trash2, X, Save,
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
  purchaseOrderId?: string | null;
  purchaseOrder?: { id: string } | null;
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

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
interface ConfirmDeleteModalProps {
  title: string;
  message: React.ReactNode;
  items?: string[];        // bullet list of things that will be deleted
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

function ConfirmDeleteModal({ title, message, items, onConfirm, onCancel, busy }: ConfirmDeleteModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        padding: '1.5rem',
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        border: '1px solid var(--line)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--danger-soft, #fee2e2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Trash2 style={{ width: 16, height: 16, color: 'var(--danger, #ef4444)' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
        </div>

        {/* Body */}
        <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: items ? 10 : 20 }}>
          {message}
        </div>

        {/* Bullet list of things deleted */}
        {items && items.length > 0 && (
          <ul style={{
            margin: '0 0 20px 0',
            paddingLeft: '1.25rem',
            fontSize: '0.82rem',
            color: 'var(--danger, #ef4444)',
            lineHeight: 1.7,
          }}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{
              background: 'var(--danger, #ef4444)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
            }}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Deleting…</>
              : <><Trash2 style={{ width: 13, height: 13 }} /> Yes, delete</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Edit Form styles ───────────────────────────────────────────────────
const editPanel: React.CSSProperties = {
  margin: '0 1rem 1rem',
  padding: '1rem',
  background: 'var(--surface-2)',
  borderRadius: 8,
  border: '1px solid var(--line)',
};

// ── Page ──────────────────────────────────────────────────────────────────────
export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [qr,           setQr]           = useState<QRDetail | null>(null);
  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Add-quote form ────────────────────────────────────────────────────────
  const [quoteForm,    setQuoteForm]    = useState(emptyQuoteForm());
  const [addingQuote,  setAddingQuote]  = useState(false);
  const [savingQuote,  setSavingQuote]  = useState(false);

  // ── Winner / approve ──────────────────────────────────────────────────────
  const [winnerId,        setWinnerId]        = useState('');
  const [winnerReason,    setWinnerReason]    = useState('');
  const [approvingSaving, setApprovingSaving] = useState(false);
  const [existingPoId,    setExistingPoId]    = useState<string | null>(null);

  // ── Edit QR ───────────────────────────────────────────────────────────────
  const [editingQR,    setEditingQR]    = useState(false);
  const [qrEditForm,   setQrEditForm]   = useState({ title: '', description: '' });
  const [savingQR,     setSavingQR]     = useState(false);

  // ── Delete QR ─────────────────────────────────────────────────────────────
  const [confirmDeleteQR, setConfirmDeleteQR] = useState(false);
  const [deletingQR,      setDeletingQR]      = useState(false);

  // ── Edit quote ────────────────────────────────────────────────────────────
  const [editingQuoteId,   setEditingQuoteId]   = useState<string | null>(null);
  const [quoteEditForm,    setQuoteEditForm]    = useState(emptyQuoteForm());
  const [savingQuoteEdit,  setSavingQuoteEdit]  = useState(false);

  // ── Delete quote ──────────────────────────────────────────────────────────
  const [confirmDeleteQuoteId, setConfirmDeleteQuoteId] = useState<string | null>(null);
  const [deletingQuote,        setDeletingQuote]        = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = () => {
    if (!id) return;
    api<QRDetail>(`/quotations/${id}`)
      .then((data) => {
        setQr(data);
        if (data.winnerId)    { setWinnerId(data.winnerId); }
        if (data.winnerReason){ setWinnerReason(data.winnerReason); }

        // Resolve the linked PO id — try every field the backend might return
        const poId = data.purchaseOrderId ?? data.purchaseOrder?.id ?? null;
        if (poId) {
          setExistingPoId(poId);
        } else if (data.status === 'PO_CREATED' || data.status === 'WINNER_SELECTED') {
          // Backend didn't return the PO id directly — look it up from the PO list
          api<{ id: string; quotationRequestId?: string; quotationId?: string }[]>('/pos')
            .then((pos) => {
              const match = pos.find(
                (p) => p.quotationRequestId === id || p.quotationId === id
              );
              if (match) setExistingPoId(match.id);
            })
            .catch(() => {});
        }
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
  const usedVendorIds   = new Set(quotes.map((q) => q.vendor.id));
  const availableVendors = vendors.filter((v) => !usedVendorIds.has(v.id));
  const confirmDeleteQuote = quotes.find((q) => q.id === confirmDeleteQuoteId);

  // ── Save new vendor quote (Step 2) ────────────────────────────────────────
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
      setExistingPoId(res.purchaseOrder.id);
      navigate(`/pos/${res.purchaseOrder.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApprovingSaving(false);
    }
  };

  // ── Edit QR ───────────────────────────────────────────────────────────────
  const openEditQR = () => {
    setQrEditForm({ title: qr.title, description: qr.description ?? '' });
    setEditingQR(true);
  };

  const saveEditQR = async () => {
    if (!qrEditForm.title.trim()) { toast.error('Title is required'); return; }
    setSavingQR(true);
    try {
      await api(`/quotations/${qr.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title:       qrEditForm.title.trim(),
          description: qrEditForm.description.trim() || null,
        }),
      });
      toast.success('Quotation request updated');
      setEditingQR(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingQR(false);
    }
  };

  // ── Delete QR ─────────────────────────────────────────────────────────────
  const deleteQR = async () => {
    setDeletingQR(true);
    try {
      await api(`/quotations/${qr.id}`, { method: 'DELETE' });
      toast.success('Quotation request deleted');
      navigate('/quotations');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingQR(false);
      setConfirmDeleteQR(false);
    }
  };

  // ── Edit quote ────────────────────────────────────────────────────────────
  const openEditQuote = (q: SavedQuote) => {
    setEditingQuoteId(q.id);
    setQuoteEditForm({
      vendorId:     q.vendor.id,
      amount:       String(q.amount),
      deliveryDays: q.deliveryDays != null ? String(q.deliveryDays) : '',
      gstPct:       q.gstPct       != null ? String(q.gstPct)       : '',
      paymentTerms: q.paymentTerms ?? '',
      notes:        q.notes        ?? '',
    });
  };

  const saveEditQuote = async () => {
    if (!quoteEditForm.amount) { toast.error('Enter the quote amount'); return; }
    setSavingQuoteEdit(true);
    try {
      await api(`/quotations/${qr.id}/quotes/${editingQuoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount:       Number(quoteEditForm.amount),
          deliveryDays: quoteEditForm.deliveryDays ? Number(quoteEditForm.deliveryDays) : null,
          gstPct:       quoteEditForm.gstPct       ? Number(quoteEditForm.gstPct)       : null,
          paymentTerms: quoteEditForm.paymentTerms  || null,
          notes:        quoteEditForm.notes         || null,
        }),
      });
      toast.success('Quote updated');
      setEditingQuoteId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update quote');
    } finally {
      setSavingQuoteEdit(false);
    }
  };

  // ── Delete quote ──────────────────────────────────────────────────────────
  const deleteQuote = async () => {
    if (!confirmDeleteQuoteId) return;
    setDeletingQuote(true);
    try {
      await api(`/quotations/${qr.id}/quotes/${confirmDeleteQuoteId}`, { method: 'DELETE' });
      toast.success('Vendor quote deleted');
      setConfirmDeleteQuoteId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete quote');
    } finally {
      setDeletingQuote(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Confirm delete QR modal ── */}
      {confirmDeleteQR && (
        <ConfirmDeleteModal
          title="Delete quotation request?"
          message={
            <>Are you sure you want to delete <strong>"{qr.title}"</strong>? This action cannot be undone.</>
          }
          items={[
            `Quotation request: ${qr.title}`,
            `${quotes.length} vendor quote${quotes.length !== 1 ? 's' : ''} attached to this request`,
            ...(isSettled ? ['Associated purchase order link will be broken'] : []),
          ]}
          onConfirm={deleteQR}
          onCancel={() => setConfirmDeleteQR(false)}
          busy={deletingQR}
        />
      )}

      {/* ── Confirm delete quote modal ── */}
      {confirmDeleteQuoteId && confirmDeleteQuote && (
        <ConfirmDeleteModal
          title="Delete vendor quote?"
          message={
            <>Are you sure you want to remove the quote from <strong>{confirmDeleteQuote.vendor.name}</strong>?</>
          }
          items={[
            `Vendor: ${confirmDeleteQuote.vendor.name}`,
            `Amount: ${formatINR(confirmDeleteQuote.amount)}`,
            ...(confirmDeleteQuote.isWinner ? ['⚠ This is the current winner — deleting it will un-settle the request'] : []),
          ]}
          onConfirm={deleteQuote}
          onCancel={() => setConfirmDeleteQuoteId(null)}
          busy={deletingQuote}
        />
      )}

      <PageHeader
        title={qr.title}
        subtitle={`${qr.project.name}${qr.lineItem ? ' · ' + qr.lineItem.description : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusPill status={qr.status} />

            {/* Edit QR button */}
            {!isSettled && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={openEditQR}
                title="Edit quotation request"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Pencil style={{ width: 13, height: 13 }} /> Edit
              </button>
            )}

            {/* Delete QR button */}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setConfirmDeleteQR(true)}
              title="Delete this quotation request"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--danger-soft, #fee2e2)',
                color: 'var(--danger, #ef4444)',
                border: '1px solid var(--danger, #ef4444)',
                fontWeight: 600,
              }}
            >
              <Trash2 style={{ width: 13, height: 13 }} /> Delete
            </button>

            <Link to="/quotations" className="btn btn-ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
          </div>
        }
      />

      {/* ── Inline edit QR form ── */}
      {editingQR && (
        <Card className="mb-4" style={{ border: '1.5px solid var(--primary)' }}>
          <CardHeader
            title="Edit quotation request"
            subtitle="Update title and description for this request"
          />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 540 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Title *</label>
                <input
                  value={qrEditForm.title}
                  onChange={(e) => setQrEditForm({ ...qrEditForm, title: e.target.value })}
                  placeholder="e.g. PV Modules supply — 1 MW"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Description / scope</label>
                <input
                  value={qrEditForm.description}
                  onChange={(e) => setQrEditForm({ ...qrEditForm, description: e.target.value })}
                  placeholder="Specs, quantity, standards, requirements…"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button" className="btn btn-primary"
                  disabled={savingQR || !qrEditForm.title.trim()}
                  onClick={saveEditQR}
                >
                  {savingQR
                    ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Saving…</>
                    : <><Save style={{ width: 13, height: 13 }} /> Save changes</>
                  }
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingQR(false)}>
                  <X style={{ width: 13, height: 13 }} /> Cancel
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

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
          subtitle="Add one quote per vendor. Edit or delete individual quotes using the action buttons."
          actions={
            !isSettled && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { setAddingQuote((v) => !v); setQuoteForm(emptyQuoteForm()); setEditingQuoteId(null); }}
              >
                <Plus className="w-3.5 h-3.5" />
                {addingQuote ? 'Cancel' : 'Add vendor quote'}
              </button>
            )
          }
        />

        {/* Add quote form */}
        {addingQuote && !isSettled && (
          <div style={editPanel}>
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
                <input type="number" min="0" placeholder="0"
                  value={quoteForm.amount}
                  onChange={(e) => setQuoteForm({ ...quoteForm, amount: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Delivery (days)</label>
                <input type="number" min="1" placeholder="30"
                  value={quoteForm.deliveryDays}
                  onChange={(e) => setQuoteForm({ ...quoteForm, deliveryDays: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>GST %</label>
                <input type="number" min="0" max="100" placeholder="18"
                  value={quoteForm.gstPct}
                  onChange={(e) => setQuoteForm({ ...quoteForm, gstPct: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Payment terms</label>
                <input placeholder="e.g. 50% advance"
                  value={quoteForm.paymentTerms}
                  onChange={(e) => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Notes</label>
              <textarea
                placeholder="Enter quotation remarks..."
                value={quoteForm.notes}
                onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                rows={4}
                style={{
                  width: '100%', minHeight: '100px', padding: '10px',
                  border: '1px solid var(--line)', borderRadius: '6px',
                  resize: 'vertical', fontFamily: 'inherit',
                }}
              />
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
              <button type="button" className="btn btn-ghost"
                onClick={() => { setAddingQuote(false); setQuoteForm(emptyQuoteForm()); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Edit quote inline form */}
        {editingQuoteId && (
          <div style={{ ...editPanel, borderColor: 'var(--primary)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Edit vendor quote
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {/* vendor is read-only in edit mode */}
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Vendor</label>
                <input
                  value={quotes.find((q) => q.id === editingQuoteId)?.vendor.name ?? ''}
                  readOnly
                  style={{ background: 'var(--surface-2)', color: 'var(--muted)', cursor: 'not-allowed' }}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Amount (₹) *</label>
                <input type="number" min="0"
                  value={quoteEditForm.amount}
                  onChange={(e) => setQuoteEditForm({ ...quoteEditForm, amount: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Delivery (days)</label>
                <input type="number" min="1"
                  value={quoteEditForm.deliveryDays}
                  onChange={(e) => setQuoteEditForm({ ...quoteEditForm, deliveryDays: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>GST %</label>
                <input type="number" min="0" max="100"
                  value={quoteEditForm.gstPct}
                  onChange={(e) => setQuoteEditForm({ ...quoteEditForm, gstPct: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Payment terms</label>
                <input
                  value={quoteEditForm.paymentTerms}
                  onChange={(e) => setQuoteEditForm({ ...quoteEditForm, paymentTerms: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Notes</label>
              <textarea
                value={quoteEditForm.notes}
                onChange={(e) => setQuoteEditForm({ ...quoteEditForm, notes: e.target.value })}
                rows={4}
                style={{
                  width: '100%', minHeight: '100px', padding: '10px',
                  border: '1px solid var(--line)', borderRadius: '6px',
                  resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button" className="btn btn-primary"
                disabled={savingQuoteEdit || !quoteEditForm.amount}
                onClick={saveEditQuote}
              >
                {savingQuoteEdit
                  ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Saving…</>
                  : <><Save style={{ width: 13, height: 13 }} /> Save changes</>
                }
              </button>
              <button type="button" className="btn btn-ghost"
                onClick={() => setEditingQuoteId(null)}>
                <X style={{ width: 13, height: 13 }} /> Cancel
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
                    <th>Vendor</th>
                    <th className="right">Amount</th>
                    <th className="right">GST %</th>
                    <th className="right">Delivery (days)</th>
                    <th>Payment terms</th>
                    <th>Notes</th>
                    <th>Status</th>
                    {!isSettled && <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>}
                    {!isSettled && <th style={{ width: 40, textAlign: 'center' }}>Select</th>}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const isLowest  = q.amount === lowestAmt && quotes.length > 1;
                    const isChecked = winnerId === q.id;
                    const isEditing = editingQuoteId === q.id;
                    return (
                      <tr
                        key={q.id}
                        style={{
                          background: q.isWinner
                            ? 'var(--green-50)'
                            : isChecked
                            ? 'var(--surface-2)'
                            : isEditing
                            ? 'var(--primary-soft, #eff6ff)'
                            : undefined,
                        }}
                      >
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

                        {/* ── Actions column ── */}
                        {!isSettled && (
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}
                            onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              {/* Edit */}
                              <button
                                type="button"
                                title="Edit this quote"
                                onClick={() => isEditing ? setEditingQuoteId(null) : openEditQuote(q)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '3px 8px', borderRadius: 5, border: '1px solid var(--line)',
                                  background: isEditing ? 'var(--primary)' : 'var(--surface)',
                                  color: isEditing ? '#fff' : 'var(--ink)',
                                  cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600,
                                }}
                              >
                                <Pencil style={{ width: 11, height: 11 }} />
                                {isEditing ? 'Editing' : 'Edit'}
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                title="Delete this quote"
                                onClick={() => setConfirmDeleteQuoteId(q.id)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '3px 8px', borderRadius: 5,
                                  border: '1px solid var(--danger, #ef4444)',
                                  background: 'var(--danger-soft, #fee2e2)',
                                  color: 'var(--danger, #ef4444)',
                                  cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600,
                                }}
                              >
                                <Trash2 style={{ width: 11, height: 11 }} />
                                Delete
                              </button>
                            </div>
                          </td>
                        )}

                        {/* ── Select checkbox (last column) ── */}
                        {!isSettled && (
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}
                            onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setWinnerId(isChecked ? '' : q.id);
                                if (isChecked) setWinnerReason('');
                              }}
                              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                          </td>
                        )}
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
                  <button type="button" className="btn btn-ghost"
                    onClick={() => { setWinnerId(''); setWinnerReason(''); }}>
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
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (existingPoId) {
                  navigate(`/pos/${existingPoId}`);
                } else {
                  // existingPoId still resolving — fetch one more time then navigate
                  api<{ id: string; quotationRequestId?: string; quotationId?: string }[]>('/pos')
                    .then((pos) => {
                      const match = pos.find(
                        (p) => p.quotationRequestId === qr.id || p.quotationId === qr.id
                      );
                      if (match) {
                        setExistingPoId(match.id);
                        navigate(`/pos/${match.id}`);
                      } else {
                        navigate('/pos');
                      }
                    })
                    .catch(() => navigate('/pos'));
                }
              }}
            >
              View Purchase Order →
            </button>
          </CardBody>
        </Card>
      )}

      <Link to="/quotations" className="btn btn-link btn-sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to POs &amp; Quotes
      </Link>
    </div>
  );
}

const metaLabel: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
};
