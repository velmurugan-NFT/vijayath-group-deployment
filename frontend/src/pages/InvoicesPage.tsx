import { useEffect, useState } from 'react';
import { api, apiDownload } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { toast } from 'sonner';
import { useProjectContext } from '@/context/ProjectContext';

type Project = { id: string; name: string; parentId: string | null };

export function InvoicesPage() {
  const { activeProject } = useProjectContext();
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ projectId: '', type: 'PROFORMA', amount: 1500000, milestone: '' });
  const filteredInvoices = activeProject
  ? invoices.filter(
      (i) =>
        (i.project as { id?: string })?.id ===
        activeProject.id
    )
  : invoices;

const filteredProjects = activeProject
  ? projects.filter(
      (p) =>
        p.id === activeProject.id ||
        p.parentId === activeProject.id
    )
  : projects;

  useEffect(() => {
    api<Record<string, unknown>[]>('/invoices').then(setInvoices);
   
    api<Project[]>('/projects').then((all) => {
      setProjects(all);
      // Default to the first project so the select is never empty-valued
      if (all.length > 0) setForm((f) => ({ ...f, projectId: all[0].id }));
    });
  }, []);
  useEffect(() => {
  if (filteredProjects.length === 0) {
    setForm((f) => ({
      ...f,
      projectId: '',
    }));
    return;
  }

  const exists = filteredProjects.some(
    (p) => p.id === form.projectId
  );

  if (!exists) {
    setForm((f) => ({
      ...f,
      projectId: filteredProjects[0].id,
    }));
  }
}, [activeProject, filteredProjects]);

  const generate = async () => {
    if (!form.projectId) { toast.error('Select a project first'); return; }
    const inv = await api<{ id: string; invoiceNumber: string }>('/invoices', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    toast.success(`Invoice ${inv.invoiceNumber} generated`);
    toast.info('Email would be sent to client contact');
    api<Record<string, unknown>[]>('/invoices').then(setInvoices);
  };

  return (
    <div>
      <PageHeader title="Customer Invoices" subtitle="Proforma and tax invoices" />
      <Card className="card-pad mb-6">
        <h2 className="font-semibold text-vijayanth-green mb-2">Generate invoice</h2>
        {/* Project select — all projects in scope, grouped by parent/sub */}
        <select
          className="border rounded px-3 py-2 mr-2"
          value={form.projectId}
          onChange={(e) => setForm({ ...form, projectId: e.target.value })}
        >
          <option value="">— select project —</option>
          {/* Parent projects */}
          {filteredProjects.filter((p) => !p.parentId).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          {/* Sub-projects grouped under a divider */}
          {filteredProjects.some((p) => p.parentId) && (
            <optgroup label="Sub-projects">
              {filteredProjects.filter((p) => p.parentId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <select
          className="border rounded px-3 py-2 mr-2"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="PROFORMA">Proforma</option>
          <option value="TAX">Tax</option>
        </select>
        <input
          type="number"
          className="border rounded px-3 py-2 mr-2 w-36"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: +e.target.value })}
        />
        <button type="button" className="btn-primary" onClick={generate}>Generate</button>
      </Card>
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th className="p-2">Invoice #</th>
              <th className="p-2">Project</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2">Date</th>
              <th></th>
            </tr>
          </thead>
       <tbody>

  {filteredInvoices.map((i) => (
    <tr key={String(i.id)}>
      <td className="p-2">
        {String(i.invoiceNumber)}
      </td>

      <td className="p-2">
        {(i.project as { name: string }).name}
      </td>

      <td className="p-2 text-right">
        {formatINR(i.amount as number)}
      </td>

      <td className="p-2">
        {formatDate(i.issuedAt as string)}
      </td>

      <td className="p-2">
        <button
          type="button"
          className="underline text-vijayanth-green text-xs"
          onClick={() =>
            apiDownload(
              `/invoices/${i.id}/pdf`,
              `${i.invoiceNumber}.pdf`
            )
          }
        >
          PDF
        </button>
      </td>
    </tr>
  ))}

  {filteredInvoices.length === 0 && (
    <tr>
      <td
        colSpan={5}
        className="text-center p-6 text-gray-500"
      >
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
