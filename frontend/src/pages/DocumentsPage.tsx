import { useEffect, useState } from 'react';
import { api, apiUpload } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { useProjectIdFromUrl } from '@/context/ProjectContext';

export function DocumentsPage() {
  const urlProjectId = useProjectIdFromUrl();
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(urlProjectId ?? '');

  const loadDocs = (pid?: string) => {
    const q = pid || projectId ? `?projectId=${pid || projectId}` : '';
    api<Record<string, unknown>[]>(`/documents${q}`).then(setDocs);
  };

  useEffect(() => {
    api('/projects').then((p: { id: string; name: string; parentId: string | null }[]) => {
      const subs = p.filter((x) => x.parentId);
      setProjects(subs);
      const id = urlProjectId ?? subs[0]?.id ?? '';
      setProjectId(id);
      if (id) loadDocs(id);
      else api<Record<string, unknown>[]>('/documents').then(setDocs);
    });
  }, [urlProjectId]);

  useEffect(() => { if (projectId) loadDocs(projectId); }, [projectId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    fd.append('category', 'General');
    await apiUpload('/documents', fd);
    toast.success('Document uploaded');
    api<Record<string, unknown>[]>('/documents').then(setDocs);
  };

  return (
    <div>
      <PageHeader title="Documents" subtitle="Project document repository" />
      <div className="card card-pad mb-4 flex gap-4 items-center">
        <select className="border rounded px-3 py-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="file" onChange={upload} className="text-sm" />
      </div>
      <Card><table className="tbl">
        <thead><tr><th className="p-2 text-left">File</th><th className="p-2">Project</th><th className="p-2">Uploaded</th><th></th></tr></thead>
        <tbody>{docs.map((d) => (
          <tr key={String(d.id)}><td className="p-2">{String(d.filename)}</td><td className="p-2">{(d.project as { name: string })?.name}</td>
            <td className="p-2">{formatDate(d.createdAt as string)}</td>
            <td className="p-2"><a href={`/api/documents/${d.id}/download`} className="underline text-vijayanth-green">Download</a></td></tr>
        ))}</tbody>
      </table></Card>
    </div>
  );
}
