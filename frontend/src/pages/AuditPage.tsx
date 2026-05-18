import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/formatDate';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { useProjectQuery } from '@/hooks/useProjectQuery';

export function AuditPage() {
  const pq = useProjectQuery();
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));

  const load = () => api<Record<string, unknown>[]>(`/audit?from=${from}${pq ? pq.replace('?', '&') : ''}`).then(setLogs);
  useEffect(() => { load(); }, [from, pq]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Immutable activity trail · Super Admin & Corporate" />
      <div className="field mb-4 max-w-xs"><label>From date</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <Card>
        <table className="tbl">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>{logs.map((l) => (
            <tr key={String(l.id)}>
              <td>{formatDate(l.createdAt as string)} {(l.createdAt as string).slice(11, 16)}</td>
              <td className="name-cell">{(l.user as { name: string }).name}</td>
              <td>{String(l.action)}</td>
              <td><code className="mono text-xs">{String(l.entityType)}</code></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
