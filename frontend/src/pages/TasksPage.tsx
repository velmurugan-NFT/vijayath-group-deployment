import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { SectionHeader } from '@/components/design/SectionHeader';
import { FormDialog } from '@/components/FormDialog';
import { Plus } from 'lucide-react';
import { useProjectIdFromUrl } from '@/context/ProjectContext';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { toast } from 'sonner';

interface Task { id: string; title: string; department: string; status: string; isDelayed: boolean; plannedEnd: string; project: { id: string; name: string }; remarks?: string }
type Project = { id: string; name: string };

export function TasksPage() {
  const projectId = useProjectIdFromUrl();
  const pq = useProjectQuery();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState('IN_PROGRESS');
  const [newTask, setNewTask] = useState({ projectId: projectId ?? '', title: '', department: 'Civil', plannedEnd: '' });

  const load = () => api<Task[]>(`/tasks${pq}`).then(setTasks);
  useEffect(() => {
    load();
    api<Project[]>('/projects').then(setProjects);
  }, [pq]);

  const save = async () => {
    if (!selected) return;
    await api(`/tasks/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status, remarks: remark }) });
    toast.success('Task updated');
    setSelected(null);
    load();
  };

  const create = async () => {
    await api('/tasks', { method: 'POST', body: JSON.stringify({ ...newTask, status: 'NOT_STARTED' }) });
    toast.success('Task created');
    setCreateOpen(false);
    load();
  };

  const depts = [...new Set(tasks.map((t) => t.department))];

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Project tasks by department" actions={<button type="button" className="btn btn-primary" onClick={() => { setNewTask((t) => ({ ...t, projectId: projectId ?? t.projectId })); setCreateOpen(true); }}><Plus className="w-3.5 h-3.5" /> Add task</button>} />
      {depts.map((dept) => (
        <div key={dept} className="mb-6">
          <SectionHeader title={dept} />
          <Card>
            <table className="tbl">
              <thead><tr><th>Task</th><th>Project</th><th>Planned end</th><th>Status</th><th>Delay</th><th className="right"></th></tr></thead>
              <tbody>
                {tasks.filter((t) => t.department === dept).map((t) => (
                  <tr key={t.id} className={t.isDelayed ? 'delayed' : ''}>
                    <td className="name-cell">{t.title}</td><td>{t.project.name}</td>
                    <td>{formatDate(t.plannedEnd)}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.isDelayed ? <StatusBadge status="DELAYED" /> : '—'}</td>
                    <td className="right"><button type="button" className="btn btn-link btn-sm" onClick={() => { setSelected(t); setStatus(t.status); setRemark(t.remarks ?? ''); }}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}
      {selected && (
        <FormDialog open={!!selected} onOpenChange={() => setSelected(null)} title={selected.title} onSubmit={save}>
          <div className="field"><label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="NOT_STARTED">Not Started</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="field"><label>Remark</label><textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} /></div>
        </FormDialog>
      )}
      <FormDialog open={createOpen} onOpenChange={setCreateOpen} title="Add task" onSubmit={create}>
        <div className="field"><label>Project</label>
          <select value={newTask.projectId} onChange={(e) => setNewTask({ ...newTask, projectId: e.target.value })}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Title</label><input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} /></div>
        <div className="field"><label>Department</label><input value={newTask.department} onChange={(e) => setNewTask({ ...newTask, department: e.target.value })} /></div>
        <div className="field"><label>Planned end</label><input type="date" value={newTask.plannedEnd} onChange={(e) => setNewTask({ ...newTask, plannedEnd: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
