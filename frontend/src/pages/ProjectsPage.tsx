import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { FormDialog } from '@/components/FormDialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Filter, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useProjectContext } from '@/context/ProjectContext';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  name: string;
  status: string;
  billable: number;
  netCost?: number;
  profit?: number;
  parentId: string | null;
  client?: string;
  capacityMw?: number;
  // Project head assignment — returned from the API via assignments include
  assignments?: { user: { id: string; name: string; role: string } }[];
}
type Template   = { id: string; name: string };
type UserOption = { id: string; name: string; role: string };
type ProjectType = 'parent' | 'sub';

const EMPTY_FORM = {
  name: '', templateId: '', client: 'VCPPL',
  billable: '', sectorId: '', projectHeadId: '',
  capacityMw: '', parentId: '',
};

const STATUS_OPTIONS = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'IN_EXECUTION', 'COMMISSIONING', 'COMPLETED', 'CLOSED'];

// Helper — find the project head name from assignments
function getProjectHead(project: Project): string | null {
  if (!project.assignments?.length) return null;
  const head = project.assignments.find((a) => a.user.role === 'PROJECT_HEAD');
  return head?.user.name ?? project.assignments[0]?.user.name ?? null;
}

// ─── Delete Warning Modal ──────────────────────────────────────────────────────
function DeleteProjectModal({
  project, onConfirm, onCancel, deleting,
}: {
  project: Project | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (project) setTyped(''); }, [project]);
  if (!project) return null;
  const confirmed = typed.trim().toLowerCase() === project.name.trim().toLowerCase();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '2rem 2rem 1.75rem', maxWidth: 460, width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--line)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', marginBottom: 6 }}>Delete project permanently?</div>
        <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>⚠ This cannot be undone</div>
          <div style={{ color: '#7f1d1d' }}>Deleting <strong>"{project.name}"</strong> will permanently remove:</div>
          <ul style={{ margin: '6px 0 0 16px', color: '#7f1d1d', padding: 0 }}>
            <li>All tasks and daily status updates</li>
            <li>All quotation requests and quotes</li>
            <li>All purchase orders (draft/pending only)</li>
            <li>All documents and audit logs</li>
            <li>Any attached sub-projects</li>
          </ul>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
            Type <strong style={{ color: 'var(--ink)' }}>{project.name}</strong> to confirm deletion:
          </div>
          <input
            type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={project.name} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: 7, border: typed.length > 0 ? confirmed ? '1.5px solid var(--success)' : '1.5px solid var(--danger)' : '1.5px solid var(--line)', fontSize: '0.875rem', outline: 'none', background: confirmed ? 'var(--success-soft)' : 'var(--surface)', transition: 'border-color 0.15s, background 0.15s' }}
          />
          {typed.length > 0 && !confirmed && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: 4 }}>Name does not match — keep typing</div>}
          {confirmed && <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginTop: 4 }}>✓ Confirmed</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={deleting}>Cancel — keep project</button>
          <button type="button" disabled={!confirmed || deleting} onClick={onConfirm}
            style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', border: 'none', display: 'flex', alignItems: 'center', gap: 6, background: confirmed && !deleting ? '#dc2626' : '#f3a9a9', color: '#fff', transition: 'background 0.15s' }}>
            {deleting ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Deleting…</> : <><Trash2 style={{ width: 14, height: 14 }} /> Delete project</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Project Modal ────────────────────────────────────────────────────────
function EditProjectModal({
  project, onSave, onCancel, saving,
}: {
  project: Project | null;
  onSave: (id: string, data: Partial<Project>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ name: '', client: '', capacityMw: '', billable: 0, status: '' });

  useEffect(() => {
    if (project) {
      setForm({
        name:       project.name,
        client:     project.client ?? '',
        capacityMw: project.capacityMw != null ? String(project.capacityMw) : '',
        billable:   project.billable,
        status:     project.status,
      });
    }
  }, [project]);

  if (!project) return null;

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    onSave(project.id, {
      name:       form.name.trim(),
      client:     form.client.trim() || undefined,
      capacityMw: form.capacityMw !== '' ? Number(form.capacityMw) : undefined,
      billable:   form.billable,
      status:     form.status,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '1.75rem 2rem', maxWidth: 480, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--green-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Pencil style={{ width: 16, height: 16, color: 'var(--green)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>Edit project</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 1 }}>Update project details</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
          <div className="field">
            <label>Project name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} autoFocus />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Client</label>
            <input type="text" value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Capacity (MW)</label>
              <input type="number" min="0" step="0.01" placeholder="e.g. 10.5" value={form.capacityMw} onChange={(e) => setForm((f) => ({ ...f, capacityMw: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Billable (₹)</label>
              <input type="number" value={form.billable} onChange={(e) => setForm((f) => ({ ...f, billable: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProjectsPage ──────────────────────────────────────────────────────────────
export function ProjectsPage() {
  const { user } = useAuth();
  const { activeProject } = useProjectContext();

  const [projects,     setProjects]     = useState<Project[]>([]);
  const [templates,    setTemplates]    = useState<Template[]>([]);
  const [users,        setUsers]        = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [open,         setOpen]         = useState(false);
  const [projectType,  setProjectType]  = useState<ProjectType>('parent');
  const [form,         setForm]         = useState(EMPTY_FORM);

  const [editTarget,   setEditTarget]   = useState<Project | null>(null);
  const [editSaving,   setEditSaving]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const loadProjects = async () => {
    try {
      const data = await api<Project[]>('/projects');
      setProjects(data);
    } catch {
      toast.error('Could not load projects');
    }
  };

  useEffect(() => {
    loadProjects();
    api<Template[]>('/settings/templates').then(setTemplates).catch(() => {});
    api('/settings/sectors').then((data: unknown) => {
      const sectors = data as { id: string; name: string }[];
      const solar = sectors.find((s) => s.name === 'Solar');
      if (solar) setForm((f) => ({ ...f, sectorId: solar.id }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || !canCreate) return;
    setUsersLoading(true);
    api<UserOption[]>('/projects/eligible-heads')
      .then(setUsers)
      .catch(() => toast.error('Could not load project heads'))
      .finally(() => setUsersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredProjects = activeProject
    ? projects.filter((p) => p.id === activeProject.id || p.parentId === activeProject.id)
    : projects;

  const projectIds    = new Set(filteredProjects.map((p) => p.id));
  const topLevel      = filteredProjects.filter((p) => !p.parentId || !projectIds.has(p.parentId));
  const parentOptions = projects.filter((p) => !p.parentId);

  const canCreate =
    user?.role === 'SECTOR_HEAD'     ||
    user?.role === 'SUPER_ADMIN'     ||
    user?.role === 'CORPORATE_OFFICE';

  const create = async () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    if (projectType === 'sub' && !form.parentId) { toast.error('Select a parent project'); return; }
    await api('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name:          form.name.trim(),
        templateId:    form.templateId    || undefined,
        client:        form.client,
        billable:      form.billable,
        sectorId:      form.sectorId,
        projectHeadId: form.projectHeadId || undefined,
        capacityMw:    form.capacityMw !== '' ? Number(form.capacityMw) : undefined,
        parentId:      projectType === 'sub' ? form.parentId : undefined,
      }),
    });
    await loadProjects();
    toast.success(projectType === 'sub' ? 'Sub-project created' : 'Project created');
    setOpen(false);
    setProjectType('parent');
    setForm((f) => ({ ...EMPTY_FORM, sectorId: f.sectorId }));
  };

  const handleEditSave = async (id: string, data: Partial<Project>) => {
    setEditSaving(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      await loadProjects();
      toast.success('Project updated');
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/projects/${deleteTarget.id}`, { method: 'DELETE' });
      await loadProjects();
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const openDialog = () => {
    setProjectType('parent');
    setForm((f) => ({ ...EMPTY_FORM, sectorId: f.sectorId }));
    setOpen(true);
  };

  // ── Action buttons ────────────────────────────────────────────────────────
  const ActionButtons = ({ project }: { project: Project }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <Link to={`/projects/${project.id}`} className="btn btn-ghost btn-sm" style={{ marginRight: 2 }}>Open</Link>
      {canCreate && (
        <>
          <button type="button" title="Edit project" className="btn btn-ghost btn-sm" style={{ padding: '0 8px', color: 'var(--muted)' }} onClick={() => setEditTarget(project)}>
            <Pencil style={{ width: 13, height: 13 }} />
          </button>
          <button type="button" title="Delete project" className="btn btn-sm"
            style={{ padding: '0 8px', color: 'var(--danger)', border: '1px solid transparent', background: 'transparent' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(182,52,42,.25)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
            onClick={() => setDeleteTarget(project)}>
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </>
      )}
    </div>
  );

  // ── Project name cell — name on top, assigned head below ─────────────────
  const ProjectNameCell = ({ project, indent = false }: { project: Project; indent?: boolean }) => {
    const headName = getProjectHead(project);
    return (
      <td className="name-cell" style={indent ? { paddingLeft: 36 } : undefined}>
        {indent && <span style={{ color: 'var(--muted)', marginRight: 6, fontSize: '0.75rem' }}>↳</span>}
        <span style={{ fontWeight: 600 }}>{project.name}</span>
        <div className="secondary" style={indent ? { paddingLeft: 14 } : undefined}>
          {indent ? 'Sub-project' : `Parent · ${project.client ?? 'VCPPL'}`}
        </div>
        {/* Project head shown below project name — only when assigned */}
        {headName && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 3,
            fontSize: '0.7rem',
            color: 'var(--muted)',
            paddingLeft: indent ? 14 : 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {headName}
          </div>
        )}
      </td>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <EditProjectModal project={editTarget} onSave={handleEditSave} onCancel={() => setEditTarget(null)} saving={editSaving} />
      <DeleteProjectModal project={deleteTarget} onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} deleting={deleting} />

      <PageHeader
        title="Projects"
        subtitle="VCPPL Usilampatti site · Solar sector"
        actions={
          canCreate ? (
            <>
              <button type="button" className="btn btn-ghost"><Filter className="w-3.5 h-3.5" /> Filter</button>
              <button type="button" className="btn btn-primary" onClick={openDialog}><Plus className="w-3.5 h-3.5" /> New project</button>
            </>
          ) : undefined
        }
      />

      <Card>
        {/* FIX: table width 100% to stretch full width; removed duplicate empty <th> */}
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>Project</th>
              <th>Status</th>
              <th className="right">Capacity</th>
              <th className="right">Billable</th>
              <th className="right">Net cost</th>
              <th className="right">Profit</th>
              {/* FIX: merged Action header + width into one <th>; removed the extra empty <th> */}
              <th className="right" style={{ width: canCreate ? 160 : 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {topLevel.map((p) => (
              <Fragment key={p.id}>
                {/* FIX: removed duplicate <td><ActionButtons /></td> — now only one per row */}
                <tr className="group-row">
                  <ProjectNameCell project={p} />
                  <td><StatusBadge status={p.status} /></td>
                  <td className="right amt">{p.capacityMw ? `${p.capacityMw} MW` : '—'}</td>
                  <td className="right amt"><strong>{formatINR(p.billable)}</strong></td>
                  <td className="right amt">{p.netCost != null ? formatINR(p.netCost) : '—'}</td>
                  <td className="right amt" style={{ color: 'var(--success)', fontWeight: 600 }}>{p.profit != null ? formatINR(p.profit) : '—'}</td>
                  <td className="right"><ActionButtons project={p} /></td>
                </tr>

                {filteredProjects.filter((c) => c.parentId === p.id).map((c) => (
                  <tr key={c.id}>
                    <ProjectNameCell project={c} indent />
                    <td><StatusBadge status={c.status} /></td>
                    <td className="right amt">{c.capacityMw ? `${c.capacityMw} MW` : '—'}</td>
                    <td className="right amt">{formatINR(c.billable)}</td>
                    <td className="right amt">{c.netCost != null ? formatINR(c.netCost) : '—'}</td>
                    <td className="right amt" style={{ color: 'var(--success)' }}>{c.profit != null ? formatINR(c.profit) : '—'}</td>
                    <td className="right"><ActionButtons project={c} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}

            {topLevel.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No projects found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* ── Create project dialog ── */}
      <FormDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setProjectType('parent'); }} title="Create project" onSubmit={create}>
        <div className="field">
          <label>Project type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.125rem' }}>
            {(['parent', 'sub'] as ProjectType[]).map((type) => (
              <button key={type} type="button"
                onClick={() => { setProjectType(type); if (type === 'parent') setForm((f) => ({ ...f, parentId: '' })); }}
                style={{ padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-sm)', border: projectType === type ? '2px solid var(--green)' : '1.5px solid var(--line)', background: projectType === type ? 'var(--green-50)' : 'var(--surface)', color: projectType === type ? 'var(--green-deep)' : 'var(--ink-2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 2 }}>
                  {projectType === type && <span style={{ color: 'var(--green)', marginRight: 4 }}>✓</span>}
                  {type === 'parent' ? 'Parent project' : 'Sub-project'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>
                  {type === 'parent' ? 'Standalone or top-level project' : 'Nested under a parent project'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {projectType === 'sub' && (
          <div className="field">
            <label>Parent project *</label>
            <select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))} required>
              <option value="">— select parent project —</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {parentOptions.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 4 }}>No parent projects available. Create a parent project first.</div>
            )}
          </div>
        )}

        <div className="field">
          <label>Name *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={projectType === 'sub' ? 'e.g. Phase 2 — 5 MW' : 'e.g. Usilampatti Solar 10 MW'} />
        </div>
        <div className="field">
          <label>Sector</label>
          <input value="Solar" readOnly style={{ background: 'var(--surface-2)', color: 'var(--muted)', cursor: 'default', pointerEvents: 'none' }} />
        </div>
        <div className="field">
          <label>Template</label>
          <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
            <option value="">None</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>
            Project Head
            {usersLoading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin opacity-50" />}
          </label>
          <select value={form.projectHeadId} onChange={(e) => setForm({ ...form, projectHeadId: e.target.value })} disabled={usersLoading}>
            <option value="">{usersLoading ? 'Loading…' : '— assign project head —'}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Client</label>
          <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Capacity (MW)</label>
            <input type="number" min="0" step="0.01" placeholder="e.g. 10.5" value={form.capacityMw} onChange={(e) => setForm({ ...form, capacityMw: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Billable (₹)</label>
            <input type="number" value={form.billable} onChange={(e) => setForm({ ...form, billable: Number(e.target.value) })} style={{ width: '140px' }} />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
