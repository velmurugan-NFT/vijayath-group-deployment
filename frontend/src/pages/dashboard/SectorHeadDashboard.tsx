import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from '@/lib/formatINR';
import { KpiCard } from '@/components/KpiCard';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { StatusPill } from '@/components/design/StatusPill';
import { cn } from '@/lib/utils';

export function SectorHeadDashboard({ data }: { data: Record<string, unknown> }) {
  const heatmap = (data.heatmap as { id: string; name: string; status: string; delayedCount: number; profit: number; variancePct: number; billable: number }[]) ?? [];
  const receivables = (data.receivables as { name: string; balance: number }[]) ?? [];
  const pendingPOs = (data.pendingPOs as { id: string; poNumber: string; totalAmount: number }[]) ?? [];
  const pendingPayments = (data.pendingPayments as unknown[]) ?? [];

  return (
    <>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <KpiCard label="Sub-projects" value={String(heatmap.length)} href="/projects" accent />
        <KpiCard label="Pending approvals" value={String(pendingPOs.length + pendingPayments.length)} variant="warning" href="/approvals" />
        <KpiCard label="Sector receivables" value={formatINR(receivables.reduce((s, r) => s + r.balance, 0))} href="/receivables" />
      </div>

      <Card className="mb-5">
        <CardHeader title="Project heat-map" subtitle="Delay intensity · budget variance" />
        <CardBody>
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Delayed</th>
                <th className="right">Profit</th>
                <th className="right">Variance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {heatmap.map((p) => (
                <tr key={p.id}>
                  <td className="name-cell">{p.name}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td>
                    <div className="heatmap-grid w-24">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'heatmap-cell',
                            p.delayedCount > 2 ? 'late-2' : p.delayedCount > 0 ? 'late' : i < 3 ? 'h1' : 'h2',
                          )}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="right amt">{formatINR(p.profit)}</td>
                  <td className={cn('right amt', p.variancePct > 0 ? 'text-vijayanth-danger' : 'text-vijayanth-success')}>{p.variancePct}%</td>
                  <td className="right"><Link to={`/projects/${p.id}`} className="btn btn-link btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Receivables balance" subtitle="Outstanding by sub-project (₹ lakh)" />
        <CardBody>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={receivables.map((r) => ({ name: r.name.replace('Usilampatti ', ''), balance: r.balance / 100000 }))}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => formatINR(v * 100000)} />
              <Bar dataKey="balance" fill="#133E22" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </>
  );
}
