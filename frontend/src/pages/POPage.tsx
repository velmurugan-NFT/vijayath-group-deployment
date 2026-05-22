import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/design/Card';
import { BudgetBreachWarning } from '@/components/BudgetBreachWarning';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  Send, RotateCcw, CheckCircle2, XCircle, Pencil, ChevronRight,
  FilePen, History, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

type POVersion = {
  id: string;
  version: number;
  title: string;
  totalAmount: number;
  status: string;
  amendReason?: string;
  snapshotAt: string;
  snapshotById?: string;
};

type PO = {
  id: string; poNumber: string; title: string; status: string;
  totalAmount: number; createdAt: string; deliveryDate?: string; paymentTerms?: string; rejectReason?: string;
  version?: number;
  vendor: { id: string; name: string };
  project: { id: string; name: string };
  requester: { name: string };
  approver?: { name: string };
  lineItems: { id: string; description: string; amount: number; lineItem?: { description: string } }[];
  budgetImpact?: { lineItemId: string; description: string; currentCommitted: number; newCommitted: number; estimated: number; breach: boolean }[];
  versions?: POVersion[];
};

export function POPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pos,          setPos]          = useState<PO[]>([]);
  const [detail,       setDetail]       = useState<PO | null>(null);
  const [ackBreach,    setAckBreach]    = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [showReject,   setShowReject]   = useState(false);
  const [showReturn,   setShowReturn]   = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);

  // FR-6.3 AC2: edit draft/returned
  const [editing,  setEditing]  = useState(false);
  const [editForm, setEditForm] = useState({ title: '', totalAmount: '', deliveryDate: '', paymentTerms: '' });

  // FR-6.5: amend approved PO
  const [amending,    setAmending]    = useState(false);
  const [amendForm,   setAmendForm]   = useState({ title: '', totalAmount: '', deliveryDate: '', paymentTerms: '', amendReason: '' });
  const [amendSaving, setAmendSaving] = useState(false);

  const load = () => api<PO[]>('/pos').then(setPos);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (id) api<PO>(`/pos/${id}`).then((p) => {
      setDetail(p);
      setAckBreach(false); setShowReject(false); setShowReturn(false);
      setEditing(false); setAmending(false); setShowHistory(false);
    });
  }, [id]);

  const refreshDetail = () => {
    if (id) api<PO>(`/pos/${id}`).then(setDetail);
  };

  const startEdit = (po: PO) => {
    setEditing(true); setAmending(false);
    setEditForm({
      title:        po.title,
      totalAmount:  String(po.totalAmount),
      deliveryDate: po.deliveryDate ? po.deliveryDate.slice(0, 10) : '',
      paymentTerms: po.paymentTerms ?? '',
    });
  };

  const saveEdit = async () => {
    if (!detail) return;
    try {
      const updated = await api<PO>(`/pos/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title:        editForm.title,
          totalAmount:  Number(editForm.totalAmount),
          deliveryDate: editForm.deliveryDate || undefined,
          paymentTerms: editForm.paymentTerms || undefined,
        }),
      });
      setDetail(updated); setEditing(false);
      toast.success('PO updated'); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update'); }
  };

  // FR-6.5: start amendment
  const startAmend = (po: PO) => {
    setAmending(true); setEditing(false);
    setAmendForm({
      title:        po.title,
      totalAmount:  String(po.totalAmount),
      deliveryDate: po.deliveryDate ? po.deliveryDate.slice(0, 10) : '',
      paymentTerms: po.paymentTerms ?? '',
      amendReason:  '',
    });
  };

  const saveAmend = async () => {
    if (!detail) return;
    if (!amendForm.amendReason.trim()) { toast.error('Amendment reason is required (FR-6.5)'); return; }
    setAmendSaving(true);
    try {
      const result = await api<PO & { requiresReapproval?: boolean }>(`/pos/${detail.id}/amend`, {
        method: 'POST',
        body: JSON.stringify({
          title:        amendForm.title,
          totalAmount:  amendForm.totalAmount ? Number(amendForm.totalAmount) : undefined,
          deliveryDate: amendForm.deliveryDate || undefined,
          paymentTerms: amendForm.paymentTerms || undefined,
          amendReason:  amendForm.amendReason,
        }),
      });
      setAmending(false);
      if (result.requiresReapproval) {
        toast.success('PO amended — re-approval required because amount changed (FR-6.5 AC2)');
      } else {
        toast.success('PO amended successfully');
      }
      refreshDetail(); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to amend'); }
    finally { setAmendSaving(false); }
  };

  const approve = async () => {
    if (!detail) return;
    try {
      await api(`/pos/${detail.id}/approve`, { method: 'POST', body: JSON.stringify({ acknowledgeBreach: ackBreach }) });
      toast.success('PO approved'); refreshDetail(); load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (msg.includes('breach') || msg.includes('Budget')) toast.error('Acknowledge budget breach to proceed');
      else toast.error(msg);
    }
  };

  const reject = async () => {
    if (!detail || !rejectReason.trim()) { toast.error('Reason is required'); return; }
    await api(`/pos/${detail.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
    toast.success('PO rejected'); setShowReject(false); refreshDetail(); load();
  };

  const returnForEdit = async () => {
    if (!detail) return;
    await api(`/pos/${detail.id}/return`, { method: 'POST', body: JSON.stringify({ reason: returnReason || 'Returned for edit' }) });
    toast.success('PO returned for edit'); setShowReturn(false); refreshDetail(); load();
  };

  // FR-6.4 AC3
  const sendToVendor = async () => {
    if (!detail) return;
    await api(`/pos/${detail.id}/send`, { method: 'POST' });
    toast.success('PO marked as sent to vendor'); refreshDetail(); load();
  };

  const submitForApproval = async () => {
    if (!detail) return;
    await api(`/pos/${detail.id}/submit`, { method: 'POST' });
    toast.success('PO submitted for approval'); refreshDetail(); load();
  };

  // ── PO detail view ──
  if (id && detail) {
    const impact     = detail.budgetImpact ?? [];
    const hasBreach  = impact.some((i) => i.breach);
    const isDraft    = detail.status === 'DRAFT' || detail.status === 'RETURNED';
    const isPending  = detail.status === 'PENDING_APPROVAL';
    const isApproved = detail.status === 'APPROVED' || detail.status === 'SENT_TO_VENDOR';
    const canApprove = isPending && user?.role !== 'PROJECT_HEAD';
    const canAmend   = isApproved && user?.role !== 'PROJECT_HEAD';
    const currentVersion = detail.version ?? 1;
    const hasHistory = (detail.versions ?? []).length > 0;

    return (
      <div>
        <PageHeader
          title={`PO ${detail.poNumber}`}
          subtitle={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {detail.vendor.name} · {detail.project.name}
              {currentVersion > 1 && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px',
                  background: 'var(--gold)', color: 'var(--green-deep)', borderRadius: 4,
                }}>
                  v{currentVersion}
                </span>
              )}
            </span>
          }
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              {isDraft && !editing && (
                <button type="button" className="btn btn-ghost" onClick={() => startEdit(detail)}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {isDraft && (
                <button type="button" className="btn btn-primary" onClick={submitForApproval}>
                  <Send className="w-3.5 h-3.5" /> Submit for approval
                </button>
              )}
              {canAmend && !amending && (
                <button type="button" className="btn btn-ghost" onClick={() => startAmend(detail)}>
                  <FilePen className="w-3.5 h-3.5" /> Amend PO
                </button>
              )}
              {detail.status === 'APPROVED' && (
                <button type="button" className="btn btn-primary" onClick={sendToVendor}>
                  <Send className="w-3.5 h-3.5" /> Send to Vendor
                </button>
              )}
              {hasHistory && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <History className="w-3.5 h-3.5" />
                  History
                  {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          }
        />

        {/* Status / summary card */}
        <Card className="mb-4 card-pad">
          {detail.rejectReason && (detail.status === 'REJECTED' || detail.status === 'RETURNED') && (
            <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: 'var(--danger)', fontSize: '0.875rem' }}>
              <strong>{detail.status === 'RETURNED' ? 'Returned:' : 'Rejected:'}</strong> {detail.rejectReason}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Amount</div>
              <div className="amt font-semibold" style={{ fontSize: '1.1rem' }}>{formatINR(detail.totalAmount)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Status</div>
              <StatusBadge status={detail.status} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Raised by</div>
              <div style={{ fontSize: '0.875rem' }}>{detail.requester.name}</div>
            </div>
            {detail.approver && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Approved by</div>
                <div style={{ fontSize: '0.875rem' }}>{detail.approver.name}</div>
              </div>
            )}
            {detail.deliveryDate && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Delivery date</div>
                <div style={{ fontSize: '0.875rem' }}>{formatDate(detail.deliveryDate)}</div>
              </div>
            )}
            {detail.paymentTerms && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 2 }}>Payment terms</div>
                <div style={{ fontSize: '0.875rem' }}>{detail.paymentTerms}</div>
              </div>
            )}
          </div>
        </Card>

        {/* FR-6.5 AC1: version history */}
        {showHistory && hasHistory && (
          <Card className="mb-4" style={{ borderLeft: '3px solid var(--gold)' }}>
            <CardHeader title="Version history" subtitle="Previous versions — read-only" />
            <CardBody className="p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Title</th>
                    <th className="right">Amount</th>
                    <th>Status at snapshot</th>
                    <th>Amendment reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.versions ?? []).map((v) => (
                    <tr key={v.id}>
                      <td>
                        <span style={{
                          fontWeight: 700, fontSize: '0.75rem', padding: '2px 7px',
                          background: 'var(--surface-2)', borderRadius: 4,
                        }}>
                          v{v.version}
                        </span>
                      </td>
                      <td className="name-cell">{v.title}</td>
                      <td className="right amt">{formatINR(v.totalAmount)}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{v.amendReason ?? '—'}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatDate(v.snapshotAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}

        {/* FR-6.3 AC2: inline edit form */}
        {editing && (
          <Card className="mb-4" style={{ borderLeft: '3px solid var(--gold)' }}>
            <CardHeader title="Edit PO" subtitle="Editing draft — changes require re-submit" />
            <CardBody>
              <div className="space-y-3 max-w-lg">
                <div className="field">
                  <label>Title</label>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Total amount (₹)</label>
                  <input type="number" value={editForm.totalAmount} onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })} />
                </div>
                <div className="field">
                  <label>Delivery date</label>
                  <input type="date" value={editForm.deliveryDate} onChange={(e) => setEditForm({ ...editForm, deliveryDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Payment terms</label>
                  <input placeholder="e.g. 30% advance, 70% on delivery" value={editForm.paymentTerms} onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={saveEdit}><CheckCircle2 className="w-3.5 h-3.5" /> Save</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* FR-6.5: amendment form */}
        {amending && (
          <Card className="mb-4" style={{ borderLeft: '3px solid var(--gold)' }}>
            <CardHeader
              title={`Amend PO — v${currentVersion} → v${currentVersion + 1}`}
              subtitle="Approved PO amendment · current version will be archived in history"
            />
            <CardBody>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--warning-soft)', border: '1px solid var(--warning)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                  color: 'var(--warning)', fontSize: '0.875rem',
                }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                If amount changes, the PO will return to DRAFT and require re-approval (FR-6.5 AC2).
              </div>
              <div className="space-y-3 max-w-lg">
                <div className="field">
                  <label>Title</label>
                  <input value={amendForm.title} onChange={(e) => setAmendForm({ ...amendForm, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Total amount (₹)</label>
                  <input type="number" value={amendForm.totalAmount} onChange={(e) => setAmendForm({ ...amendForm, totalAmount: e.target.value })} />
                </div>
                <div className="field">
                  <label>Delivery date</label>
                  <input type="date" value={amendForm.deliveryDate} onChange={(e) => setAmendForm({ ...amendForm, deliveryDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Payment terms</label>
                  <input placeholder="e.g. 30% advance, 70% on delivery" value={amendForm.paymentTerms} onChange={(e) => setAmendForm({ ...amendForm, paymentTerms: e.target.value })} />
                </div>
                <div className="field">
                  <label style={{ color: 'var(--danger)' }}>Amendment reason * (FR-6.5)</label>
                  <input
                    placeholder="State the reason for this amendment…"
                    value={amendForm.amendReason}
                    onChange={(e) => setAmendForm({ ...amendForm, amendReason: e.target.value })}
                    style={{ borderColor: !amendForm.amendReason.trim() ? 'var(--danger)' : undefined }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button" className="btn btn-primary"
                    disabled={amendSaving || !amendForm.amendReason.trim()}
                    onClick={saveAmend}
                  >
                    <FilePen className="w-3.5 h-3.5" />
                    {amendSaving ? 'Saving…' : 'Save amendment'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAmending(false)}>Cancel</button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Line items */}
        {detail.lineItems.length > 0 && (
          <Card className="mb-4">
            <CardHeader title="Line items" />
            <CardBody className="p-0">
              <table className="tbl">
                <thead><tr><th>Description</th><th className="right">Amount</th></tr></thead>
                <tbody>
                  {detail.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td>{li.description}</td>
                      <td className="right amt">{formatINR(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}

        {/* Budget breach warning */}
        {hasBreach && (
          <BudgetBreachWarning lines={impact} checked={ackBreach} onCheckedChange={setAckBreach} />
        )}

        {/* Approver actions (FR-6.4 AC2) */}
        {canApprove && !showReject && !showReturn && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={approve}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowReturn(true)}>
              <RotateCcw className="w-3.5 h-3.5" /> Return for edit
            </button>
            <button type="button" className="btn btn-danger-ghost" onClick={() => setShowReject(true)}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}

        {showReject && (
          <Card className="mt-3" style={{ borderLeft: '3px solid var(--danger)' }}>
            <CardBody>
              <div className="field">
                <label style={{ color: 'var(--danger)' }}>Rejection reason *</label>
                <input
                  placeholder="State the reason for rejection…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-danger-ghost" disabled={!rejectReason.trim()} onClick={reject}>
                  Confirm rejection
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowReject(false)}>Cancel</button>
              </div>
            </CardBody>
          </Card>
        )}

        {showReturn && (
          <Card className="mt-3" style={{ borderLeft: '3px solid var(--warning)' }}>
            <CardBody>
              <div className="field">
                <label style={{ color: 'var(--warning)' }}>Return note (optional)</label>
                <input
                  placeholder="What needs to be changed?"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={returnForEdit}>
                  <RotateCcw className="w-3.5 h-3.5" /> Return for edit
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowReturn(false)}>Cancel</button>
              </div>
            </CardBody>
          </Card>
        )}

        <Link to="/quotations" className="btn btn-link btn-sm" style={{ marginTop: 16, display: 'inline-flex' }}>
          ← Back to POs &amp; Quotes
        </Link>
      </div>
    );
  }

  // ── PO list view ──
  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="All POs in your scope" />
      <Card>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 520 }}>
          <table className="tbl">
          <thead>
            <tr>
              <th>PO #</th>
              <th>Project</th>
              <th>Vendor</th>
              <th>Date</th>
              <th className="right">Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => (
              <tr key={p.id}>
                <td className="name-cell mono">{p.poNumber}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{p.project.name}</td>
                <td>{p.vendor.name}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDate(p.createdAt)}</td>
                <td className="right amt">{formatINR(p.totalAmount)}</td>
                <td><StatusBadge status={p.status} /></td>
                <td className="right">
                  <Link to={`/pos/${p.id}`} className="btn btn-link btn-sm">
                    View <ChevronRight className="w-3 h-3 inline" />
                  </Link>
                </td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  No purchase orders yet.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
