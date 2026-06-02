import { useEffect, useState } from 'react';
import { api, apiDownload } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { FormDialog } from '@/components/FormDialog';
import { toast } from 'sonner';
import { useProjectContext } from '@/context/ProjectContext';
import { FileDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

type Invoice = {
  id: string;
  invoiceNumber: string;
  type: string;
  amount: number;
  milestone?: string | null;
  issuedAt: string;
  project: { id: string; name: string };
  _count?: { receiptLinks: number };
};

function isInvoiceReceived(invoice: Invoice): boolean {
  return (invoice._count?.receiptLinks ?? 0) > 0;
}

function DeleteInvoiceModal({
  invoice,
  onConfirm,
  onCancel,
  deleting,
}: {
  invoice: Invoice | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  if (!invoice) return null;
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
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#fee2e2', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <Trash2 size={20} color="#ef4444" />
        </div>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6, color: 'var(--ink)' }}>
          Delete invoice?
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You are about to permanently delete invoice{' '}
          <strong style={{ color: 'var(--ink)' }}>{invoice.invoiceNumber}</strong>{' '}
          ({formatINR(invoice.amount)}). This action cannot be undone.
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
              fontSize: '0.875rem', cursor: deleting ? 'not-allowed' : 'pointer',
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

export function InvoicesPage() {
  const { activeProject, projects, loading: projectsLoading } = useProjectContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState({ projectId: '', type: 'PROFORMA', amount: 1500000, milestone: '' });
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({ type: 'PROFORMA', amount: 0, milestone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredProjects = activeProject
    ? projects.filter(
        (p) =>
          p.id === activeProject.id ||
          p.parentId === activeProject.id,
      )
    : projects;

  const projectIds = new Set(filteredProjects.map((p) => p.id));
  const topLevelProjects = filteredProjects.filter(
    (p) => !p.parentId || !projectIds.has(p.parentId ?? ''),
  );
  const subProjects = filteredProjects.filter(
    (p) => p.parentId && projectIds.has(p.parentId),
  );

  const scopedProjectIds = activeProject
    ? new Set([
        activeProject.id,
        ...projects.filter((p) => p.parentId === activeProject.id).map((p) => p.id),
      ])
    : null;

  const filteredInvoices = scopedProjectIds
    ? invoices.filter((i) => scopedProjectIds.has(i.project?.id ?? ''))
    : invoices;

  const loadInvoices = () => {
    api<Invoice[]>('/invoices').then(setInvoices).catch(() => {});
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    if (projectsLoading) return;

    if (filteredProjects.length === 0) {
      setForm((f) => (f.projectId ? { ...f, projectId: '' } : f));
      return;
    }

    setForm((f) => {
      if (filteredProjects.some((p) => p.id === f.projectId)) return f;
      const preferredId =
        activeProject && filteredProjects.some((p) => p.id === activeProject.id)
          ? activeProject.id
          : topLevelProjects[0]?.id ?? filteredProjects[0].id;
      return { ...f, projectId: preferredId };
    });
  }, [activeProject?.id, projectsLoading, projects]);

  const generate = async () => {
    if (!form.projectId) { toast.error('Select a project first'); return; }
    const inv = await api<{ id: string; invoiceNumber: string }>('/invoices', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    toast.success(`Invoice ${inv.invoiceNumber} generated`);
    loadInvoices();
  };

  const openEdit = (invoice: Invoice) => {
    setEditTarget(invoice);
    setEditForm({
      type: invoice.type,
      amount: Number(invoice.amount),
      milestone: invoice.milestone ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.amount || editForm.amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setEditSaving(true);
    try {
      await api(`/invoices/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: editForm.type,
          amount: editForm.amount,
          milestone: editForm.milestone || undefined,
        }),
      });
      toast.success(`Invoice ${editTarget.invoiceNumber} updated`);
      setEditTarget(null);
      loadInvoices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update invoice');
    } finally {
      setEditSaving(false);
    }
  };

  const downloadPdf = async (invoice: Invoice) => {
    try {
      await apiDownload(
        `/invoices/${invoice.id}/pdf`,
        `${invoice.invoiceNumber}.pdf`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/invoices/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(`Invoice ${deleteTarget.invoiceNumber} deleted`);
      setDeleteTarget(null);
      loadInvoices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <DeleteInvoiceModal
        invoice={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />

      <FormDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        title={editTarget ? `Edit ${editTarget.invoiceNumber}` : 'Edit invoice'}
        onSubmit={saveEdit}
        submitLabel={editSaving ? 'Saving…' : 'Save'}
      >
        <div className="field">
          <label>Type</label>
          <select
            value={editForm.type}
            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
          >
            <option value="PROFORMA">Proforma</option>
            <option value="TAX">Tax</option>
          </select>
        </div>
        <div className="field">
          <label>Amount (₹)</label>
          <input
            type="number"
            value={editForm.amount || ''}
            onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Milestone (optional)</label>
          <input
            value={editForm.milestone}
            onChange={(e) => setEditForm({ ...editForm, milestone: e.target.value })}
            placeholder="e.g. Advance payment"
          />
        </div>
      </FormDialog>

      <PageHeader title="Customer Invoices" subtitle="Proforma and tax invoices" />
      <Card className="card-pad mb-6">
        <h2 className="font-semibold text-vijayanth-green mb-3">Generate Invoice</h2>
        <div className="flex flex-wrap items-center gap-2 w-full">
          <select
            className="border border-vijayanth-line rounded-[7px] px-3 py-2 text-[13px] min-w-[180px] bg-white"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">
              {projectsLoading
                ? 'Loading projects…'
                : filteredProjects.length === 0
                  ? 'No projects in scope'
                  : '— select project —'}
            </option>
            {topLevelProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {subProjects.length > 0 && (
              <optgroup label="Sub-projects">
                {subProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <select
            className="border border-vijayanth-line rounded-[7px] px-3 py-2 text-[13px] min-w-[120px] bg-white"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="PROFORMA">Proforma</option>
            <option value="TAX">Tax</option>
          </select>
          <input
            type="number"
            className="border border-vijayanth-line rounded-[7px] px-3 py-2 text-[13px] w-36 bg-white"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: +e.target.value })}
          />
          <button type="button" className="btn btn-primary ml-auto" onClick={generate}>
            Generate
          </button>
        </div>
      </Card>
      <Card>
        <table className="tbl">
          <colgroup>
            <col />
            <col style={{ width: '8rem' }} />
            <col />
            <col style={{ width: '11rem' }} />
            <col style={{ width: '7rem' }} />
            <col style={{ width: '10rem' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Project</th>
              <th className="right">Amount</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((i) => (
              <tr key={i.id}>
                <td className="name-cell">
                  <code className="mono text-[11px]">{i.invoiceNumber}</code>
                </td>
                <td>{formatDate(i.issuedAt)}</td>
                <td>{i.project.name}</td>
                <td className="right amt">{formatINR(i.amount)}</td>
                <td>
                  <StatusBadge status={isInvoiceReceived(i) ? 'RECEIVED' : 'UNRECEIVED'} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Download PDF"
                      style={{
                        background: 'none', border: '1px solid var(--line)',
                        color: 'var(--vijayanth-green, #134d22)', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      onClick={() => downloadPdf(i)}
                    >
                      <FileDown style={{ width: 13, height: 13 }} />
                      PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Edit invoice"
                      style={{ padding: '0 8px', color: 'var(--muted)' }}
                      onClick={() => openEdit(i)}
                    >
                      <Pencil style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Delete invoice"
                      style={{
                        background: 'none', border: '1px solid #fca5a5',
                        color: '#ef4444', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      onClick={() => setDeleteTarget(i)}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>
                  No invoices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
