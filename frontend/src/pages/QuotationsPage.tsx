import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { useProjectContext, useProjectIdFromUrl } from '@/context/ProjectContext';
import { cn } from '@/lib/utils';
import { Plus, FolderOpen, Loader2 } from 'lucide-react';

interface Vendor    { id: string; name: string }
interface LineItem  { id: string; description: string }
interface WBSCat    { id: string; name: string; lineItems: LineItem[] }
interface Quote     { id: string; amount: number; deliveryDays: number; vendor: { name: string } }
interface QR        { id: string; title: string; status: string; quotations?: Quote[] }
interface VendorRow { vendorId: string; amount: number; deliveryDays: number }

const EMPTY_FORM = { lineItemId: '', title: '', description: '', vendors: [] as VendorRow[] };

export function QuotationsPage() {
  const { projects, activeProject, setActiveProjectId, loading: projectsLoading } = useProjectContext();
  const urlProjectId = useProjectIdFromUrl();

  // Auto-select the project from the URL as soon as the projects list is loaded.
  // This handles the "Open project → New quote" navigation where the URL already
  // carries ?projectId=<id> but the context hasn't selected it yet.
  useEffect(() => {
    if (!projectsLoading && urlProjectId && activeProject?.id !== urlProjectId) {
      const match = projects.find((p) => p.id === urlProjectId);
      if (match) setActiveProjectId(match.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoading, urlProjectId]);

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [wbs,      setWbs]      = useState<WBSCat[]>([]);
  const [requests, setRequests] = useState<QR[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [step,        setStep]       = useState<0 | 1>(0);
  const [qrId,        setQrId]       = useState('');
  const [winnerId,    setWinnerId]   = useState('');
  const [liveQuotes,  setLiveQuotes] = useState<Quote[]>([]);
  const [form,     setForm]     = useState(EMPTY_FORM);

  const pid = activeProject?.id ?? '';

  const [saving, setSaving] = useState(false);

  const loadRequests = (projectId: string) =>
    api<QR[]>(`/quotations?projectId=${projectId}`)
      .then(setRequests).catch(() => setRequests([]));

  // Load vendors once
  useEffect(() => {
    api<Vendor[]>('/vendors').then(setVendors).catch(() => {});
  }, []);

  // When active project changes → load WBS + quotation requests for that project
  useEffect(() => {
    if (!pid) { setWbs([]); setRequests([]); return; }
    setWbsLoading(true);
    api<WBSCat[]>(`/projects/${pid}/wbs`)
      .then(setWbs)
      .catch(() => setWbs([]))
      .finally(() => setWbsLoading(false));
    loadRequests(pid);
    setForm(EMPTY_FORM);
    setStep(0);
  }, [pid]);

  const allLineItems = wbs.flatMap((c) =>
    c.lineItems.map((l) => ({ ...l, catName: c.name }))
  );

  // ── vendor row helpers ──
  const addVendorRow  = () =>
    setForm((f) => ({ ...f, vendors: [...f.vendors, { vendorId: '', amount: 0, deliveryDays: 30 }] }));
  const updateRow = (i: number, patch: Partial<VendorRow>) =>
    setForm((f) => { const r = [...f.vendors]; r[i] = { ...r[i], ...patch }; return { ...f, vendors: r }; });
  const removeRow = (i: number) =>
    setForm((f) => ({ ...f, vendors: f.vendors.filter((_, idx) => idx !== i) }));

  // ── create quotation request ──
  const createRequest = async () => {
    if (!pid)               { toast.error('Select a project first'); return; }
    if (!form.lineItemId)   { toast.error('Select a WBS line item'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.vendors.length) { toast.error('Add at least one vendor quote'); return; }
    if (form.vendors.some((v) => !v.vendorId || !v.amount)) {
      toast.error('Fill vendor name and amount for every row'); return;
    }

    setSaving(true);
    try {
      const qr = await api<{ id: string }>('/quotations', {
        method: 'POST',
        body: JSON.stringify({ projectId: pid, lineItemId: form.lineItemId, title: form.title, description: form.description }),
      });
      setQrId(qr.id);

      const saved: Quote[] = [];
      for (const row of form.vendors) {
        const q = await api<Quote>(`/quotations/${qr.id}/quotes`, {
          method: 'POST',
          body: JSON.stringify({ vendorId: row.vendorId, amount: row.amount, deliveryDays: row.deliveryDays }),
        });
        saved.push(q);
      }
      setLiveQuotes(saved);
      setStep(1);
      loadRequests(pid);
      toast.success('Quotation created — compare vendors below');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  // ── select winner → create PO ──
  const selectWinner = async () => {
    setSaving(true);
    try {
      const res = await api<{ purchaseOrder: { id: string; poNumber: string } }>(
        `/quotations/${qrId}/select-winner`,
        { method: 'POST', body: JSON.stringify({ quotationId: winnerId, reason: 'Best value' }) },
      );
      await api(`/pos/${res.purchaseOrder.id}/submit`, { method: 'POST' });
      toast.success(`PO ${res.purchaseOrder.poNumber} submitted for approval`);
      setStep(0); setWinnerId(''); setQrId(''); setForm(EMPTY_FORM); setLiveQuotes([]);
      loadRequests(pid);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit PO');
    } finally {
      setSaving(false);
    }
  };

  const quotes = liveQuotes.length > 0 ? liveQuotes : (requests.find((r) => r.id === qrId)?.quotations ?? []);

  // Show all projects in the selector (parents and sub-projects alike)
  const allProjects = projects;

  // ── Loading state ──
  if (projectsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading projects…
      </div>
    );
  }

  // ── No projects at all ──
  if (!projectsLoading && allProjects.length === 0) {
    return (
      <div>
        <PageHeader title="POs & Quotes" subtitle="No projects assigned to you yet" />
        <Card><CardBody>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            You have no projects assigned. Ask your Sector Head to assign you to a project.
          </p>
        </CardBody></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="POs & Quotes"
        subtitle={activeProject ? `Project: ${activeProject.name}` : 'Select a project to begin'}
        actions={<Link to="/approvals" className="btn btn-ghost">Approvals queue</Link>}
      />

      {/* ── Project selector ──
          Always visible. Highlights the active project.
          When arriving from a project page via "New quote", this auto-highlights that project.
      */}
      <Card className="mb-4" style={{ borderLeft: '3px solid var(--accent)' }}>
        <CardBody style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Select project:
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {allProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProjectId(p.id)}
                  className={cn('btn btn-sm', pid === p.id ? 'btn-primary' : 'btn-ghost')}
                  style={{ fontSize: '0.8rem' }}
                >
                  {p.name}
                  {pid === p.id && <span style={{ marginLeft: 4 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── No project selected yet ── */}
      {!pid && (
        <Card><CardBody>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            ↑ Select a project above to raise a quotation request.
          </p>
        </CardBody></Card>
      )}

      {/* ── Main content — only shown when a project is active ── */}
      {pid && (
        <>
          {/* Create quotation request */}
          <Card className="mb-6">
            <CardHeader
              title="New quotation request"
              subtitle={`Step ${step + 1} of 2 · ${activeProject?.name}`}
            />
            <CardBody>
              {step === 0 && (
                <div className="space-y-3 max-w-2xl">

                  {/* WBS line item */}
                  <div className="field">
                    <label>WBS line item *</label>
                    {wbsLoading ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</p>
                    ) : allLineItems.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        No WBS line items found for this project. Add them in the project's WBS tab first.
                      </p>
                    ) : (
                      <select
                        value={form.lineItemId}
                        onChange={(e) => {
                          const li = allLineItems.find((l) => l.id === e.target.value);
                          setForm({ ...form, lineItemId: e.target.value, title: li?.description ?? form.title });
                        }}
                      >
                        <option value="">— select line item —</option>
                        {wbs.map((cat) => (
                          <optgroup key={cat.id} label={cat.name}>
                            {cat.lineItems.map((l) => (
                              <option key={l.id} value={l.id}>{l.description}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Title */}
                  <div className="field">
                    <label>Title *</label>
                    <input
                      placeholder="e.g. PV Modules supply — 1 MW"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>

                  {/* Description */}
                  <div className="field">
                    <label>Description</label>
                    <input
                      placeholder="Scope, specs, delivery terms…"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>

                  {/* Vendor rows */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontWeight: 600 }}>Vendor quotes</label>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={addVendorRow}>
                        <Plus className="w-3 h-3" /> Add vendor
                      </button>
                    </div>
                    {form.vendors.length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Add at least one vendor quote to compare.
                      </p>
                    )}
                    {form.vendors.map((row, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 mb-2" style={{ alignItems: 'end' }}>
                        <div className="field col-span-2" style={{ marginBottom: 0 }}>
                          {i === 0 && <label style={{ fontSize: '0.75rem' }}>Vendor</label>}
                          <select value={row.vendorId} onChange={(e) => updateRow(i, { vendorId: e.target.value })}>
                            <option value="">— select vendor —</option>
                            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          {i === 0 && <label style={{ fontSize: '0.75rem' }}>Amount (₹)</label>}
                          <input type="number" value={row.amount || ''} onChange={(e) => updateRow(i, { amount: +e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                            {i === 0 && <label style={{ fontSize: '0.75rem' }}>Days</label>}
                            <input type="number" value={row.deliveryDays} onChange={(e) => updateRow(i, { deliveryDays: +e.target.value })} />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            style={{ marginTop: i === 0 ? 18 : 0, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || !form.lineItemId || !form.title || form.vendors.length === 0}
                    onClick={createRequest}
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                      : <><Plus className="w-3.5 h-3.5" /> Create &amp; capture quotes</>
                    }
                  </button>
                </div>
              )}

              {/* Step 2 — compare + pick winner */}
              {step === 1 && quotes.length > 0 && (
                <>
                  <div className="compare-grid mb-4" style={{ gridTemplateColumns: `200px repeat(${quotes.length}, 1fr)` }}>
                    <div className="cell l-cell">Vendor</div>
                    {quotes.map((q) => (
                      <div key={q.id} className={cn('cell h-cell', winnerId === q.id && 'winner')}>{q.vendor.name}</div>
                    ))}
                    <div className="cell l-cell">Total (incl. GST)</div>
                    {quotes.map((q) => (
                      <div key={q.id} className={cn('cell amt', winnerId === q.id && 'winner')}>{formatINR(q.amount)}</div>
                    ))}
                    <div className="cell l-cell">Delivery (days)</div>
                    {quotes.map((q) => (
                      <div key={q.id} className={cn('cell', winnerId === q.id && 'winner')}>{q.deliveryDays ?? '—'}</div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {quotes.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        className={cn('btn', winnerId === q.id ? 'btn-gold' : 'btn-ghost')}
                        onClick={() => setWinnerId(q.id)}
                      >
                        Select {q.vendor.name.split(' ')[0]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-primary ml-auto"
                      disabled={saving || !winnerId}
                      onClick={selectWinner}
                    >
                      {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</> : 'Submit PO for approval'}
                    </button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {/* Quotation request history for this project */}
          <Card>
            <CardHeader title={`Quotation requests · ${activeProject?.name}`} />
            <CardBody className="p-0">
              <table className="tbl">
                <thead>
                  <tr><th>Title</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="name-cell">{r.title}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="right">
                        <Link to={`/pos?projectId=${pid}`} className="btn btn-link btn-sm">View POs</Link>
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                        No quotation requests for this project yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
