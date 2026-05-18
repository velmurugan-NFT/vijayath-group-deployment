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
import { Filter, Plus, ChevronRight } from 'lucide-react';

interface Project { id: string; name: string; status: string; billable: number; netCost?: number; profit?: number; parentId: string | null; client?: string; capacityMw?: number }
type Template = { id: string; name: string };

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', templateId: '', client: 'VCPPL', billable: 0, sectorId: '' });

  useEffect(() => {
    void api<Project[]>('/projects').then(setProjects);
    api<Template[]>('/settings/templates').then(setTemplates).catch(() => {});
  }, []);

  const projectIds = new Set(projects.map((p) => p.id));
  const topLevel = projects.filter((p) => !p.parentId || !projectIds.has(p.parentId));

  const create = async () => {
    await api('/projects', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Project created');
    setOpen(false);
    api<Project[]>('/projects').then(setProjects);
  };

  const canCreate = user?.role === 'SECTOR_HEAD' || user?.role === 'SUPER_ADMIN' || user?.role === 'CORPORATE_OFFICE';

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="VCPPL Usilampatti site · Solar sector"
        actions={
          canCreate ? (
            <>
              <button type="button" className="btn btn-ghost"><Filter className="w-3.5 h-3.5" /> Filter</button>
              <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> New from template</button>
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
                <tr className="group-row">
                  <td className="name-cell">{p.name}<div className="secondary">Parent · {p.client ?? 'VCPPL'}</div></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="right amt">{p.capacityMw ? `${p.capacityMw} MW` : '—'}</td>
                  <td className="right amt"><strong>{formatINR(p.billable)}</strong></td>
                  <td className="right amt">{p.netCost != null ? formatINR(p.netCost) : '—'}</td>
                  <td className="right amt text-vijayanth-success font-semibold">{p.profit != null ? formatINR(p.profit) : '—'}</td>
                  <td className="right"><Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                </tr>
                {projects.filter((c) => c.parentId === p.id).map((c) => (
                  <tr key={c.id}>
                    <td className="name-cell" style={{ paddingLeft: 36 }}>
                      {c.name}
                      <div className="secondary">Sub-project</div>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="right amt">{c.capacityMw ? `${c.capacityMw} MW` : '—'}</td>
                    <td className="right amt">{formatINR(c.billable)}</td>
                    <td className="right amt">{c.netCost != null ? formatINR(c.netCost) : '—'}</td>
                    <td className="right amt text-vijayanth-success">{c.profit != null ? formatINR(c.profit) : '—'}</td>
                    <td className="right">
                      <Link to={`/projects/${c.id}`} className="btn btn-link btn-sm">Open <ChevronRight className="w-3 h-3 inline" /></Link>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <FormDialog open={open} onOpenChange={setOpen} title="Create project" onSubmit={create}>
        <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label>Template</label>
          <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
            <option value="">None</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Client</label><input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
        <div className="field"><label>Billable (₹)</label><input type="number" value={form.billable} onChange={(e) => setForm({ ...form, billable: Number(e.target.value) })} /></div>
      </FormDialog>
    </div>
  );
}
