import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { SectionHeader } from '@/components/design/SectionHeader';
import { FormDialog } from '@/components/FormDialog';
import { Plus, Trash2 } from 'lucide-react';
import { useProjectIdFromUrl, useProjectContext } from '@/context/ProjectContext';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  department: string;
  status: string;
  isDelayed: boolean;
  plannedStart?: string;
  plannedEnd: string;
  project: { id: string; name: string };
  remarks?: string;
}
type Project = { id: string; name: string };

export function TasksPage() {
  const projectId = useProjectIdFromUrl();
  const { activeProject } = useProjectContext();   // ← watch the top-bar selection
  const pq = useProjectQuery();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    title: '',
    department: '',
    status: 'IN_PROGRESS',
    plannedStart: '',
    plannedEnd: '',
    remarks: '',
  });

  const [newTask, setNewTask] = useState({
    projectId: projectId ?? '',
    title: '',
    department: 'Civil',
    plannedStart: '',
    plannedEnd: '',
  });

  const load = () => api<Task[]>(`/tasks${pq}`).then(setTasks);

  // Re-fetch whenever the active project changes (top-bar switch)
  useEffect(() => {
    load();
  }, [activeProject?.id, pq]);  // ← activeProject.id is the key dependency

  useEffect(() => {
    api<Project[]>('/projects').then(setProjects);
  }, []);

  // Sync active project into the "new task" form
  useEffect(() => {
    const pid = activeProject?.id ?? projectId;
    if (pid) setNewTask((t) => ({ ...t, projectId: pid }));
  }, [activeProject?.id, projectId]);

  // Default to first project if nothing is selected
  useEffect(() => {
    if (projects.length && !newTask.projectId) {
      setNewTask((t) => ({ ...t, projectId: projects[0].id }));
    }
  }, [projects]);

  const openEdit = (t: Task) => {
    setSelected(t);
    setEditForm({
      title: t.title,
      department: t.department,
      status: t.status,
      plannedStart: t.plannedStart ? t.plannedStart.slice(0, 10) : '',
      plannedEnd: t.plannedEnd ? t.plannedEnd.slice(0, 10) : '',
      remarks: t.remarks ?? '',
    });
  };

  const save = async () => {
    if (!selected) return;
    await api(`/tasks/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: editForm.title,
        department: editForm.department,
        status: editForm.status,
        plannedStart: editForm.plannedStart || null,
        plannedEnd: editForm.plannedEnd || null,
        remarks: editForm.remarks,
      }),
    });
    toast.success('Task updated');
    setSelected(null);
    load();
  };

  const deleteTask = async (t: Task) => {
    if (!window.confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    setDeletingId(t.id);
    try {
      await api(`/tasks/${t.id}`, { method: 'DELETE' });
      toast.success('Task deleted');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const create = async () => {
    const pid = newTask.projectId || activeProject?.id || projectId;
    if (!pid) {
      toast.error('Please select a project');
      return;
    }
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ ...newTask, projectId: pid, status: 'NOT_STARTED' }),
    });
    toast.success('Task created');
    setCreateOpen(false);
    load();
  };

  const depts = [...new Set(tasks.map((t) => t.department))];

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={activeProject ? `${activeProject.name} — tasks by department` : 'Project tasks by department'}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNewTask((t) => ({ ...t, projectId: activeProject?.id ?? projectId ?? t.projectId }));
              setCreateOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Add task
          </button>
        }
      />

      {depts.map((dept) => (
        <div key={dept} className="mb-6">
          <SectionHeader title={dept} />
          <Card>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Planned end</th>
                  <th>Status</th>
                  <th>Delay</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem' }}>Action</th>
                  <th className="right" />
                </tr>
              </thead>
              <tbody>
                {tasks.filter((t) => t.department === dept).map((t) => (
                  <tr key={t.id} className={t.isDelayed ? 'delayed' : ''}>
                    <td className="name-cell">{t.title}</td>
                    <td>{t.project.name}</td>
                    <td>{formatDate(t.plannedEnd)}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.isDelayed ? <StatusBadge status="DELAYED" /> : '—'}</td>
                    <td className="right" style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        onClick={() => openEdit(t)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        title="Delete task"
                        disabled={deletingId === t.id}
                        onClick={() => deleteTask(t)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                          (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'none';
                        }}
                      >
                        <Trash2 width={14} height={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}

      {/* Edit dialog */}
      {selected && (
        <FormDialog open={!!selected} onOpenChange={() => setSelected(null)} title="Edit task" onSubmit={save}>
          <div className="field">
            <label>Title</label>
            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Department</label>
            <input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div className="field">
            <label>Planned start</label>
            <input type="date" value={editForm.plannedStart} onChange={(e) => setEditForm({ ...editForm, plannedStart: e.target.value })} />
          </div>
          <div className="field">
            <label>Planned end</label>
            <input type="date" value={editForm.plannedEnd} onChange={(e) => setEditForm({ ...editForm, plannedEnd: e.target.value })} />
          </div>
          <div className="field">
            <label>Remark</label>
            <textarea value={editForm.remarks} onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })} rows={3} />
          </div>
        </FormDialog>
      )}

      {/* Create dialog */}
      <FormDialog open={createOpen} onOpenChange={setCreateOpen} title="Add task" onSubmit={create}>
        <div className="field">
          <label>Project</label>
          <select value={newTask.projectId} onChange={(e) => setNewTask({ ...newTask, projectId: e.target.value })}>
            <option value="">— select a project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Title</label>
          <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
        </div>
        <div className="field">
          <label>Department</label>
          <input value={newTask.department} onChange={(e) => setNewTask({ ...newTask, department: e.target.value })} />
        </div>
        <div className="field">
          <label>Planned start</label>
          <input type="date" value={newTask.plannedStart} onChange={(e) => setNewTask({ ...newTask, plannedStart: e.target.value })} />
        </div>
        <div className="field">
          <label>Planned end</label>
          <input type="date" value={newTask.plannedEnd} onChange={(e) => setNewTask({ ...newTask, plannedEnd: e.target.value })} />
        </div>
      </FormDialog>
    </div>
  );
}
