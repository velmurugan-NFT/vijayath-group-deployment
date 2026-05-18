import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from '@/lib/formatINR';
import { KpiCard } from '@/components/KpiCard';
import { Card, CardHeader, CardBody } from '@/components/design/Card';

export function CorporateDashboard({ data }: { data: Record<string, unknown> }) {
  const portfolio = data.portfolio as { totalBillable: number; totalProfit: number; totalCost: number; projectCount: number } | null;
  const heatmap = (data.heatmap as { id: string; name: string; profit: number; delayedCount: number }[]) ?? [];
  const receivables = (data.receivables as { name: string; balance: number }[]) ?? [];

  return (
    <>
      {portfolio && (
        <div className="kpi-grid">
          <KpiCard label="Portfolio billable" value={formatINR(portfolio.totalBillable)} accent />
          <KpiCard label="Total cost" value={formatINR(portfolio.totalCost)} />
          <KpiCard label="Est. profit" value={formatINR(portfolio.totalProfit)} variant="success" />
          <KpiCard label="Active projects" value={String(portfolio.projectCount)} />
        </div>
      )}
      <div className="resp-2-1">
        <Card>
          <CardHeader title="Profit by project" subtitle="₹ lakh · sub-projects" />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={heatmap.map((p) => ({ name: p.name.replace('Usilampatti ', ''), profit: p.profit / 100000 }))}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(v: number) => formatINR(v * 100000)} />
                <Bar dataKey="profit" fill="#D9B963" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top receivables risks" />
          <CardBody className="space-y-3">
            {[...receivables].sort((a, b) => b.balance - a.balance).slice(0, 5).map((r) => (
              <div key={r.name} className="flex justify-between text-sm py-2 border-b border-vijayanth-line-soft">
                <span>{r.name}</span>
                <span className="amt font-semibold text-vijayanth-green-deep">{formatINR(r.balance)}</span>
              </div>
            ))}
            <Link to="/reports" className="btn btn-link btn-sm">Export reports →</Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
