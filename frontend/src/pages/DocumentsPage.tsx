import { useEffect, useRef, useState } from 'react';
import { api, apiDownload, apiUpload } from '@/lib/api';
import { groupDocuments, type DocumentRow, type DocGroup } from '@/lib/documentGroups';
import { DocumentsTable } from '@/components/DocumentsTable';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { Button } from '@/components/ui/button';
import { useProjectContext } from '@/context/ProjectContext';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const DOCUMENT_TYPES = [
  'Contract',
  'Drawing',
  'Specification',
  'Technical Report',
  'Certificate',
  'Invoice',
  'Photo',
  'Correspondence',
  'Permit / Approval',
  'Other',
] as const;

type WbsLineItem = { id: string; description: string };
type WbsCategory = { id: string; name: string; lineItems: WbsLineItem[] };

type DocumentForm = {
  projectId: string;
  wbsLineItemId: string;
  category: string;
  documentDate: string;
  notes: string;
  files: File[];
};

const emptyForm = (): DocumentForm => ({
  projectId: '',
  wbsLineItemId: '',
  category: '',
  documentDate: '',
  notes: '',
  files: [],
});

function DeleteDocumentModal({
  group,
  onConfirm,
  onCancel,
  deleting,
}: {
  group: DocGroup | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  if (!group) return null;
  const primary = group.docs[0];
  const fileList = group.docs.map((d) => d.filename).join(', ');
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
          Delete {group.docs.length > 1 ? `${group.docs.length} documents` : 'document'}?
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You are about to permanently delete{' '}
          <strong style={{ color: 'var(--ink)' }}>{fileList}</strong>
          {primary.project ? <> from <strong>{primary.project.name}</strong></> : ''}.
          This action cannot be undone.
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

function DocumentModal({
  open,
  mode,
  initial,
  topLevelProjects,
  subProjects,
  saving,
  onSave,
  onCancel,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: DocumentForm;
  topLevelProjects: { id: string; name: string }[];
  subProjects: { id: string; name: string }[];
  saving: boolean;
  onSave: (form: DocumentForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DocumentForm>(initial);
  const [wbs, setWbs] = useState<WbsCategory[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !form.projectId) {
      setWbs([]);
      return;
    }
    setWbsLoading(true);
    api<WbsCategory[]>(`/projects/${form.projectId}/wbs`)
      .then(setWbs)
      .catch(() => setWbs([]))
      .finally(() => setWbsLoading(false));
  }, [open, form.projectId]);

  const allLineItems = wbs.flatMap((c) =>
    c.lineItems.map((l) => ({ ...l, catName: c.name })),
  );

  const isValid =
    !!form.projectId &&
    (mode === 'edit' || form.files.length > 0);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        padding: '1.75rem 2rem', maxWidth: 520, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--line)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 18, color: 'var(--vijayanth-green-deep, #134d22)' }}>
          {mode === 'create' ? 'Add document' : 'Edit document'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Project *</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...emptyForm(), projectId: e.target.value, documentDate: form.documentDate })}
            >
              <option value="">Select project</option>
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
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>WBS item</label>
            <select
              value={form.wbsLineItemId}
              disabled={!form.projectId || wbsLoading}
              onChange={(e) => setForm({ ...form, wbsLineItemId: e.target.value })}
            >
              <option value="">
                {!form.projectId
                  ? 'Select a project first'
                  : wbsLoading
                    ? 'Loading WBS items…'
                    : allLineItems.length === 0
                      ? 'No WBS items (optional)'
                      : 'None'}
              </option>
              {wbs.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.lineItems.map((li) => (
                    <option key={li.id} value={li.id}>{li.description}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Document type</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">None</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input
              type="date"
              value={form.documentDate}
              onChange={(e) => setForm({ ...form, documentDate: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional description or context for this document…"
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{mode === 'create' ? 'Files *' : 'Replace file (optional)'}</label>
            <input
              type="file"
              className="text-sm"
              multiple={mode === 'create'}
              onChange={(e) => {
                const selected = e.target.files ? Array.from(e.target.files) : [];
                setForm({ ...form, files: mode === 'edit' ? selected.slice(0, 1) : selected });
              }}
            />
            {mode === 'create' && form.files.length > 0 && (
              <ul style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 6, paddingLeft: 16 }}>
                {form.files.map((f) => (
                  <li key={`${f.name}-${f.size}`}>{f.name}</li>
                ))}
              </ul>
            )}
            {mode === 'edit' && form.files.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Leave empty to keep the current file
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !isValid}
            onClick={() => onSave(form)}
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const { activeProject, projects, loading: projectsLoading } = useProjectContext();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editGroup, setEditGroup] = useState<DocGroup | null>(null);
  const [formInitial, setFormInitial] = useState<DocumentForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [deleteGroup, setDeleteGroup] = useState<DocGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredProjects = activeProject
    ? projects.filter(
        (p) => p.id === activeProject.id || p.parentId === activeProject.id,
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

  const filteredDocs = scopedProjectIds
    ? docs.filter((d) => scopedProjectIds.has(d.project?.id ?? ''))
    : docs;

  const docGroups = groupDocuments(filteredDocs);

  const loadDocs = () => {
    api<DocumentRow[]>('/documents').then(setDocs).catch(() => {});
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const openCreate = () => {
    const preferredId =
      activeProject && filteredProjects.some((p) => p.id === activeProject.id)
        ? activeProject.id
        : topLevelProjects[0]?.id ?? filteredProjects[0]?.id ?? '';
    setModalMode('create');
    setEditGroup(null);
    setFormInitial({ ...emptyForm(), projectId: preferredId });
    setModalOpen(true);
  };

  const openEdit = (group: DocGroup) => {
    const doc = group.docs[0];
    setModalMode('edit');
    setEditGroup(group);
    setFormInitial({
      projectId: doc.project.id,
      wbsLineItemId: doc.wbsLineItem?.id ?? '',
      category: doc.category ?? '',
      documentDate: doc.documentDate
        ? new Date(doc.documentDate).toISOString().slice(0, 10)
        : '',
      notes: doc.notes ?? '',
      files: [],
    });
    setModalOpen(true);
  };

  const buildFormData = (form: DocumentForm, forEdit: boolean) => {
    const fd = new FormData();
    fd.append('projectId', form.projectId);
    if (form.wbsLineItemId) fd.append('wbsLineItemId', form.wbsLineItemId);
    if (form.category) fd.append('category', form.category);
    if (form.documentDate) fd.append('documentDate', form.documentDate);
    if (form.notes.trim()) fd.append('notes', form.notes.trim());
    if (forEdit && form.files[0]) {
      fd.append('file', form.files[0]);
    } else {
      form.files.forEach((f) => fd.append('files', f));
    }
    return fd;
  };

  const handleSave = async (form: DocumentForm) => {
    if (savingRef.current) return;
    if (!form.projectId) { toast.error('Select a project'); return; }
    if (modalMode === 'create' && form.files.length === 0) {
      toast.error('Select at least one file to upload');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (modalMode === 'create') {
        const fd = buildFormData(form, false);
        const created = await apiUpload('/documents', fd) as DocumentRow[];
        const count = Array.isArray(created) ? created.length : 1;
        toast.success(count === 1 ? 'Document uploaded' : `${count} files uploaded as one entry`);
      } else if (editGroup) {
        const payload = {
          projectId: form.projectId,
          ...(form.wbsLineItemId ? { wbsLineItemId: form.wbsLineItemId } : {}),
          ...(form.category ? { category: form.category } : { category: '' }),
          ...(form.documentDate ? { documentDate: form.documentDate } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : { notes: '' }),
        };
        if (editGroup.batchId) {
          await api(`/documents/batches/${editGroup.batchId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          const fd = buildFormData(form, true);
          await apiUpload(`/documents/${editGroup.docs[0].id}`, fd, 'PATCH');
        }
        toast.success('Document updated');
      }
      setModalOpen(false);
      setEditGroup(null);
      loadDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save document');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const downloadGroup = async (group: DocGroup) => {
    try {
      for (const doc of group.docs) {
        await apiDownload(`/documents/${doc.id}/download`, doc.filename);
      }
      if (group.docs.length > 1) {
        toast.success(`Downloaded ${group.docs.length} files`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download file');
    }
  };

  const confirmDelete = async () => {
    if (!deleteGroup) return;
    setDeleting(true);
    try {
      if (deleteGroup.batchId) {
        await api(`/documents/batches/${deleteGroup.batchId}`, { method: 'DELETE' });
      } else {
        await api(`/documents/${deleteGroup.docs[0].id}`, { method: 'DELETE' });
      }
      toast.success('Document deleted');
      setDeleteGroup(null);
      loadDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete document');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <DeleteDocumentModal
        group={deleteGroup}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteGroup(null)}
        deleting={deleting}
      />

      <DocumentModal
        open={modalOpen}
        mode={modalMode}
        initial={formInitial}
        topLevelProjects={topLevelProjects}
        subProjects={subProjects}
        saving={saving}
        onSave={handleSave}
        onCancel={() => { setModalOpen(false); setEditGroup(null); }}
      />

      <PageHeader
        title="Documents"
        subtitle="Project Document Repository"
        actions={
          <Button onClick={openCreate} disabled={projectsLoading || filteredProjects.length === 0}>
            <Plus className="w-4 h-4" />
            Add Document
          </Button>
        }
      />

      <Card className="overflow-x-auto">
        <DocumentsTable
          groups={docGroups}
          onEdit={openEdit}
          onDelete={setDeleteGroup}
          onDownload={downloadGroup}
        />
      </Card>
    </div>
  );
}
