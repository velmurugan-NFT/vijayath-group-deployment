import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/design/Card';
import { BudgetBreachWarning } from '@/components/BudgetBreachWarning';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

export function POPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pos, setPos] = useState<Record<string, unknown>[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [ackBreach, setAckBreach] = useState(false);

  const load = () => api<Record<string, unknown>[]>('/pos').then(setPos);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (id) api(`/pos/${id}`).then(setDetail); }, [id]);

  const approve = async () => {
    if (!detail) return;
    try {
      await api(`/pos/${detail.id}/approve`, { method: 'POST', body: JSON.stringify({ acknowledgeBreach: ackBreach }) });
      toast.success('PO approved');
      setDetail(null);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (msg.includes('Budget breach')) toast.error('Acknowledge budget breach to proceed');
      else toast.error(msg);
    }
  };

  if (id && detail) {
    const impact = (detail.budgetImpact as { description: string; breach: boolean }[]) ?? [];
    const hasBreach = impact.some((i) => i.breach);
    return (
      <div>
        <PageHeader title={`PO ${String(detail.poNumber)}`} subtitle={(detail.vendor as { name: string }).name} />
        <Card className="mb-4 card-pad">
          <p className="text-sm">Amount: <span className="amt font-semibold">{formatINR(detail.totalAmount as number)}</span></p>
          <p className="text-sm mt-1">Status: <StatusBadge status={String(detail.status)} /></p>
        </Card>
        {hasBreach && (
          <BudgetBreachWarning lines={impact} checked={ackBreach} onCheckedChange={setAckBreach} />
        )}
        {detail.status === 'PENDING_APPROVAL' && user?.role !== 'PROJECT_HEAD' && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={approve}>Approve</button>
            <button type="button" className="btn btn-danger-ghost" onClick={() => api(`/pos/${detail.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected' }) }).then(() => { toast.success('Rejected'); load(); })}>Reject</button>
          </div>
        )}
        <Link to="/pos" className="btn btn-link btn-sm mt-4">← Back to list</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Approved and pending POs" />
      <Card>
        <table className="tbl">
          <thead><tr><th>PO #</th><th>Vendor</th><th className="right">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>{pos.map((p) => (
            <tr key={String(p.id)}>
              <td className="name-cell">{String(p.poNumber)}</td>
              <td>{(p.vendor as { name: string }).name}</td>
              <td className="right amt">{formatINR(p.totalAmount as number)}</td>
              <td><StatusBadge status={String(p.status)} /></td>
              <td className="right"><Link to={`/pos/${p.id}`} className="btn btn-link btn-sm">View</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
