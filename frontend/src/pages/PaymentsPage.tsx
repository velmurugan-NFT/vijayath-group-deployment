import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { StatusBadge } from '@/components/StatusBadge';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { PageHeader } from '@/components/PageHeader';

export function PaymentsPage() {
  const { user } = useAuth();
  const pq = useProjectQuery();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [poId, setPoId] = useState('');
  const [amount, setAmount] = useState(200000);
  const [utr, setUtr] = useState('');
  const [approvedId, setApprovedId] = useState('');
  const [pos, setPos] = useState<{ id: string; poNumber: string; status: string }[]>([]);

  const load = () => api<Record<string, unknown>[]>(`/payments${pq}`).then(setItems);
  useEffect(() => {
    load();
    api<Record<string, unknown>[]>(`/pos${pq}`).then((p) => setPos(p.filter((x) => x.status === 'APPROVED') as { id: string; poNumber: string; status: string }[]));
  }, [pq]);

  const create = async () => {
    const pr = await api<{ id: string }>('/payments', { method: 'POST', body: JSON.stringify({ poId, amount }) });
    await api(`/payments/${pr.id}/submit`, { method: 'POST' });
    toast.success('Payment request submitted');
    load();
  };

  const approve = async (id: string) => {
    await api(`/payments/${id}/approve`, { method: 'POST', body: JSON.stringify({ acknowledgeBreach: true }) });
    toast.success('Approved');
    load();
  };

  const execute = async () => {
    await api(`/payments/${approvedId}/execute`, { method: 'POST', body: JSON.stringify({ utr }) });
    toast.success('Payment executed');
    setApprovedId('');
    load();
  };

  return (
    <div>
      <PageHeader title="Payments" subtitle="Payment requests and UTR execution" />
      <div className="card card-pad mb-6">
        <h2 className="font-semibold text-vijayanth-green mb-2">New payment request</h2>
        <select className="border rounded px-3 py-2 mr-2" value={poId} onChange={(e) => setPoId(e.target.value)}>
          <option value="">Select PO</option>
          {pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber}</option>)}
        </select>
        <input type="number" className="border rounded px-3 py-2 mr-2 w-32" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <button type="button" className="btn-primary" onClick={create} disabled={!poId}>Submit</button>
      </div>
      {approvedId && (
        <div className="card card-pad mb-4">
          <input className="border rounded px-3 py-2 mr-2" placeholder="UTR" value={utr} onChange={(e) => setUtr(e.target.value)} />
          <button type="button" className="btn-primary" onClick={execute}>Execute payment</button>
        </div>
      )}
      <Card><table className="tbl">
        <thead><tr><th className="p-2">PO</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th><th></th></tr></thead>
        <tbody>{items.map((p) => (
          <tr key={String(p.id)}>
            <td className="p-2">{(p.po as { poNumber: string }).poNumber}</td>
            <td className="p-2 text-right">{formatINR(p.amount as number)}</td>
            <td className="p-2"><StatusBadge status={String(p.status)} /></td>
            <td className="p-2 space-x-2">
              {p.status === 'PENDING_APPROVAL' && user?.role !== 'PROJECT_HEAD' && (
                <button type="button" className="text-xs btn-primary py-1" onClick={() => approve(String(p.id))}>Approve</button>
              )}
              {p.status === 'APPROVED' && (
                <button type="button" className="text-xs btn-secondary py-1" onClick={() => setApprovedId(String(p.id))}>Execute</button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table></Card>
    </div>
  );
}
