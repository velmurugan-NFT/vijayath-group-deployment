import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/FormDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useProjectIdFromUrl } from '@/context/ProjectContext';
import { toast } from 'sonner';

type Status = { id: string; date: string; summary: string; project?: { id: string; name: string }; user?: { name: string } };
type Project = { id: string; name: string };

export function DailyStatusPage() {
  const projectId = useProjectIdFromUrl();
  const [items, setItems] = useState<Status[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ projectId: projectId ?? '', date: new Date().toISOString().slice(0, 10), summary: '' });

  const load = () => {
    const q = projectId ? `?projectId=${projectId}` : '';
    api<Status[]>(`/daily-status${q}`).then(setItems);
  };
  useEffect(() => {
    load();
    api<Project[]>('/projects').then(setProjects);
  }, [projectId]);

  const submit = async () => {
    await api('/daily-status', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Daily status submitted');
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader title="Daily status" subtitle="Site progress updates" actions={<Button onClick={() => { setForm((f) => ({ ...f, projectId: projectId ?? f.projectId })); setOpen(true); }}>Submit status</Button>} />
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.id} className="card card-pad p-4">
            <p className="font-medium text-vijayanth-green">{s.project ? <Link to={`/projects/${s.project.id}`} className="underline">{s.project.name}</Link> : '—'}</p>
            <p className="text-xs text-gray-500">{formatDate(s.date)} — {s.user?.name}</p>
            <p className="text-sm mt-2">{s.summary}</p>
          </li>
        ))}
      </ul>
      <FormDialog open={open} onOpenChange={setOpen} title="Submit daily status" onSubmit={submit}>
        <div>
          <Label>Project</Label>
          <select className="w-full border rounded px-3 py-2 mt-1" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">Select project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Summary</Label><Textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
