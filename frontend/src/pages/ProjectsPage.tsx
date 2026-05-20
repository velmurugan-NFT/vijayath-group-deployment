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
import { Filter, Plus, ChevronRight, Loader2 } from 'lucide-react';

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
}
type Template = { id: string; name: string };
type Sector   = { id: string; name: string };
// Users eligible to be assigned as project head
type UserOption = { id: string; name: string; role: string };

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sectors, setSectors]     = useState<Sector[]>([]);
  const [users, setUsers]         = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [open, setOpen]           = useState(false);
  const [form, setForm] = useState({
    name:          '',
    templateId:    '',
    client:        'VCPPL',
    billable:      0,
    sectorId:      '',
    projectHeadId: '',   // ← new: who will be assigned as project head
    capacityMw:    '',   // ← new: capacity in MW (string so input stays controlled)
  });

  useEffect(() => {
    void api<Project[]>('/projects').then(setProjects);
    api<Template[]>('/settings/templates').then(setTemplates).catch(() => {});
    api<Sector[]>('/settings/sectors').then(setSectors).catch(() => {});
  }, []);

  // Fetch eligible project heads only when the dialog opens.
  // Uses /projects/eligible-heads — a dedicated route that:
  //   • requires no special permission beyond being authenticated
  //   • returns only PROJECT_HEAD users scoped to the caller's sector
  //   • is declared before /:id so "eligible-heads" isn't treated as an ID
  useEffect(() => {
    if (!open || !canCreate) return;
    setUsersLoading(true);
    api<UserOption[]>('/projects/eligible-heads')
      .then(setUsers)
      .catch(() => toast.error('Could not load project heads'))
      .finally(() => setUsersLoading(false));
  }, [open]);

  const projectIds = new Set(projects.map((p) => p.id));
  const topLevel   = projects.filter((p) => !p.parentId || !projectIds.has(p.parentId));

  const create = async () => {
    await api('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name:          form.name,
        templateId:    form.templateId || undefined,
        client:        form.client,
        billable:      form.billable,
        sectorId:      form.sectorId,
        // Only send projectHeadId when one was actually selected
        projectHeadId: form.projectHeadId || undefined,
        // Convert to number; omit when blank
        capacityMw:    form.capacityMw !== '' ? Number(form.capacityMw) : undefined,
      }),
    });
    toast.success('Project created');
    setOpen(false);
    // Reset form
    setForm({ name: '', templateId: '', client: 'VCPPL', billable: 0, sectorId: '', projectHeadId: '', capacityMw: '' });
    api<Project[]>('/projects').then(setProjects);
  };

  const canCreate =
    user?.role === 'SECTOR_HEAD' ||
    user?.role === 'SUPER_ADMIN'  ||
    user?.role === 'CORPORATE_OFFICE';

  // Only show users who can act as a project head in the dropdown.
  // Filter to PROJECT_HEAD role so the sector head cannot accidentally
  // assign a SUPER_ADMIN or another SECTOR_HEAD as a project lead.
  const eligibleHeads = users; // already filtered by backend to PROJECT_HEAD role

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="VCPPL Usilampatti site · Solar sector"
        actions={
          canCreate ? (
            <>
              <button type="button" className="btn btn-ghost">
                <Filter className="w-3.5 h-3.5" /> Filter
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> New from template
              </button>
            </>
          ) : undefined
        }
      />

      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>Project</th>
              <th>Status</th>
              <th className="right">Capacity</th>
              <th className="right">Billable</th>
              <th className="right">Net cost</th>
              <th className="right">Profit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {topLevel.map((p) => (
              <Fragment key={p.id}>
                {/* ── Parent / top-level row ── */}
                <tr className="group-row">
                  <td className="name-cell">
                    {p.name}
                    <div className="secondary">Parent · {p.client ?? 'VCPPL'}</div>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="right amt">{p.capacityMw ? `${p.capacityMw} MW` : '—'}</td>
                  <td className="right amt"><strong>{formatINR(p.billable)}</strong></td>
                  <td className="right amt">{p.netCost != null ? formatINR(p.netCost) : '—'}</td>
                  <td className="right amt text-vijayanth-success font-semibold">
                    {p.profit != null ? formatINR(p.profit) : '—'}
                  </td>
                  <td className="right">
                    <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">Open</Link>
                  </td>
                </tr>

                {/* ── Child / sub-project rows ── */}
                {projects
                  .filter((c) => c.parentId === p.id)
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="name-cell" style={{ paddingLeft: 36 }}>
                        {c.name}
                        <div className="secondary">Sub-project</div>
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="right amt">{c.capacityMw ? `${c.capacityMw} MW` : '—'}</td>
                      <td className="right amt">{formatINR(c.billable)}</td>
                      <td className="right amt">{c.netCost != null ? formatINR(c.netCost) : '—'}</td>
                      <td className="right amt text-vijayanth-success">
                        {c.profit != null ? formatINR(c.profit) : '—'}
                      </td>
                      <td className="right">
                        <Link to={`/projects/${c.id}`} className="btn btn-link btn-sm">
                          Open <ChevronRight className="w-3 h-3 inline" />
                        </Link>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ── Create-project dialog ── */}
      <FormDialog open={open} onOpenChange={setOpen} title="Create project" onSubmit={create}>

        <div className="field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Sector *</label>
          <select
            value={form.sectorId}
            onChange={(e) => setForm({ ...form, sectorId: e.target.value })}
          >
            <option value="">— select sector —</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Template</label>
          <select
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/*
          Project Head selector
          — Only shown to roles that can create projects (canCreate guard above
            already prevents non-sector-heads from opening this dialog at all).
          — Populated with users whose role is PROJECT_HEAD so the sector head
            picks from a targeted list, not the entire org.
          — The selected user ID is sent as `projectHeadId`; the backend creates
            a ProjectAssignment row linking that user to this project.
          — Because GET /projects post-filters by assignment for PROJECT_HEAD
            users, only the assigned head will see this project in their list.
        */}
        <div className="field">
          <label>
            Project Head
            {usersLoading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin opacity-50" />}
          </label>
          <select
            value={form.projectHeadId}
            onChange={(e) => setForm({ ...form, projectHeadId: e.target.value })}
            disabled={usersLoading}
          >
            <option value="">{usersLoading ? 'Loading…' : '— assign project head —'}</option>
            {eligibleHeads.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Client</label>
          <input
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
          />
        </div>

        {/*
          Capacity (MW) field — mirrors the `capacityMw` column already on the
          Project model and displayed in the table. Kept as text so the user can
          leave it blank without the input showing "0".
        */}
        <div className="field">
          <label>Capacity (MW)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 10.5"
            value={form.capacityMw}
            onChange={(e) => setForm({ ...form, capacityMw: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Billable (₹)</label>
          <input
            type="number"
            value={form.billable}
            onChange={(e) => setForm({ ...form, billable: Number(e.target.value) })}
          />
        </div>

      </FormDialog>
    </div>
  );
}
