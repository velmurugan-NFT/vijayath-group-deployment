import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { StatusPill } from '@/components/design/StatusPill';
import { ApprovalQueueRow } from '@/components/design/ApprovalQueueRow';
import { BudgetBreachWarning } from '@/components/BudgetBreachWarning';
import { useProjectQuery } from '@/hooks/useProjectQuery';
import { toast } from 'sonner';
import { FileText, CreditCard, RefreshCw, Check } from 'lucide-react';

type ApprovalItem = {
  type: 'PO' | 'PAYMENT';
  id: string;
  poNumber?: string;
  amount: number;
  createdAt?: string;
  project?: { id: string; name: string };
  vendor?: { name: string };
  po?: { poNumber: string; vendor?: { name: string } };
  requester?: { name: string };
  purpose?: string;
  budgetImpact?: { description: string; breach: boolean }[];
};

export function ApprovalsPage() {
  const pq = useProjectQuery();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');

  const load = () => api<{ items: ApprovalItem[] }>(`/approvals${pq}`).then((r) => {
    setItems(r.items);
    if (r.items.length && !selectedId) setSelectedId(`${r.items[0].type}-${r.items[0].id}`);
  });
  useEffect(() => { load(); }, [pq]);

  const selected = items.find((i) => `${i.type}-${i.id}` === selectedId) ?? items[0];
  const approve = async () => {
    if (!selected) return;
    const path = selected.type === 'PO' ? `/pos/${selected.id}/approve` : `/payments/${selected.id}/approve`;
    const hasBreach = selected.budgetImpact?.some((b) => b.breach);
    if (hasBreach && !ack[selected.id]) {
      toast.error('Acknowledge budget breach first');
      return;
    }
    await api(path, { method: 'POST', body: JSON.stringify({ acknowledgeBreach: !!ack[selected.id], comment }) });
    toast.success('Approved');
    setComment('');
    load();
  };

  const reject = async () => {
    if (!selected || selected.type !== 'PO') return;
    await api(`/pos/${selected.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: comment || 'Rejected' }) });
    toast.success('Rejected');
    load();
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Cascading thresholds · maker-checker enforced"
        actions={<button type="button" className="btn btn-ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>}
      />
      {items.length === 0 ? (
        <p className="muted text-sm">No pending approvals</p>
      ) : (
        <div className="resp-2-1">
          <Card>
            <CardHeader title={`Queue · ${items.length} items`} />
            <div>
              {items.map((item) => {
                const id = `${item.type}-${item.id}`;
                const breach = item.budgetImpact?.some((b) => b.breach);
                return (
                  <ApprovalQueueRow
                    key={id}
                    selected={selectedId === id}
                    onClick={() => setSelectedId(id)}
                    icon={item.type === 'PO' ? <FileText className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    title={item.type === 'PO' ? `PO ${item.poNumber}` : `Payment · ${item.po?.poNumber}`}
                    description={
                      <>
                        <code className="mono text-[11px]">{item.type === 'PO' ? item.poNumber : item.po?.poNumber}</code>
                        {' · '}{item.requester?.name} · {item.project?.name}
                      </>
                    }
                    amount={formatINR(item.amount)}
                    scope={breach ? <span className="text-vijayanth-danger">⚠ breach</span> : undefined}
                  />
                );
              })}
            </div>
          </Card>

          {selected && (
            <Card>
              <CardHeader
                title={selected.type === 'PO' ? `PO ${selected.poNumber}` : `Payment request`}
                subtitle={`Requested by ${selected.requester?.name ?? '—'}`}
                actions={<StatusPill status="PENDING_APPROVAL" />}
              />
              <CardBody>
                {selected.budgetImpact?.some((b) => b.breach) && (
                  <BudgetBreachWarning
                    lines={selected.budgetImpact}
                    checked={!!ack[selected.id]}
                    onCheckedChange={(v) => setAck((a) => ({ ...a, [selected.id]: v }))}
                  />
                )}
                <div className="grid grid-cols-2 gap-3.5 mb-4 text-sm">
                  <div><span className="muted">Amount</span><p className="amt font-semibold text-base text-vijayanth-green-deep">{formatINR(selected.amount)}</p></div>
                  <div><span className="muted">Project</span><p className="font-medium"><Link to={`/projects/${selected.project?.id}`} className="underline">{selected.project?.name}</Link></p></div>
                  <div><span className="muted">Vendor</span><p>{selected.vendor?.name ?? selected.po?.vendor?.name ?? '—'}</p></div>
                  {selected.purpose && <div className="col-span-2"><span className="muted">Purpose</span><p>{selected.purpose}</p></div>}
                </div>
                {selected.budgetImpact?.map((b, i) => (
                  <p key={i} className={`text-sm mb-1 ${b.breach ? 'text-vijayanth-danger' : ''}`}>{b.description}</p>
                ))}
                <div className="note mt-4">
                  <strong>Comment (optional)</strong>
                  <textarea className="w-full mt-2 min-h-[60px] border border-vijayanth-line rounded-md p-2 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note…" />
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  {selected.type === 'PO' && <button type="button" className="btn btn-danger-ghost" onClick={reject}>Reject</button>}
                  <button type="button" className="btn btn-primary" onClick={approve}><Check className="w-3.5 h-3.5" /> Approve</button>
                </div>
                {selected.type === 'PO' && <Link to={`/pos/${selected.id}`} className="btn btn-link btn-sm mt-3">View PO →</Link>}
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
