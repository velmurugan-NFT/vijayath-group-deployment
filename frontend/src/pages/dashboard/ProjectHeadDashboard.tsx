import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from '@/lib/formatINR';
import { KpiCard } from '@/components/KpiCard';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { StatusPill } from '@/components/design/StatusPill';
import { SectionHeader } from '@/components/design/SectionHeader';
import { AlertTriangle, Wallet, TrendingUp, Clock, ChevronRight } from 'lucide-react';

export function ProjectHeadDashboard({ data }: { data: Record<string, unknown> }) {
  const budget = data.budgetSummary as {
    estimated: number;
    paid: number;
    committed: number;
    receivableBalance: number;
  } | null;

  const delayed = (data.delayedTasks as {
    id: string; title: string; department: string; projectId: string; plannedEnd?: string;
  }[]) ?? [];

  const todays = (data.todaysTasks as {
    id: string; title: string; department?: string; status: string;
    plannedEnd?: string; isDelayed?: boolean;
  }[]) ?? [];

  const pending =
    ((data.pendingPOs      as unknown[])?.length ?? 0) +
    ((data.pendingPayments as unknown[])?.length ?? 0);

  // FIX: guard against estimated === 0 to avoid NaN/Infinity in percentage
  const burnPct = budget && budget.estimated > 0
    ? Math.round((budget.paid / budget.estimated) * 100)
    : 0;

  const burn = budget
    ? [
        { name: 'Estimated', value: budget.estimated / 100000 },
        { name: 'Committed', value: budget.committed / 100000 },
        { name: 'Paid',      value: budget.paid      / 100000 },
      ]
    : [];

  return (
    <>
      {/* ── KPI row ── */}
      <div className="kpi-grid">
        <KpiCard
          label="Budget paid"
          value={budget ? `${burnPct}%` : '—'}
          sub={budget ? `${formatINR(budget.paid)} of ${formatINR(budget.estimated)}` : undefined}
          icon={TrendingUp}
          accent
        />
        <KpiCard
          label="Receivables"
          value={budget ? formatINR(budget.receivableBalance) : '—'}
          icon={Wallet}
          href="/receivables"
          variant="success"
        />
        <KpiCard
          label="Delayed tasks"
          value={String(delayed.length)}
          variant={delayed.length > 0 ? 'danger' : undefined}
          icon={AlertTriangle}
          href="/tasks"
        />
        <KpiCard
          label="Pending approvals"
          value={String(pending)}
          variant={pending > 0 ? 'warning' : undefined}
          icon={Clock}
          href="/approvals"
        />
      </div>

      {/* ── Budget burn + delayed tasks ── */}
      <div className="resp-2-1">
        <Card>
          <CardHeader title="Budget burn" subtitle="Estimated vs committed vs paid (₹ lakhs)" />
          <CardBody>
            {burn.length > 0 && budget && budget.estimated > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={burn} layout="vertical">
                  <XAxis type="number" tickFormatter={(v: number) => `${v}L`} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatINR(v * 100000)} />
                  <Bar dataKey="value" fill="#133E22" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty py-8">No budget data yet. Add WBS line items with estimates to see the chart.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Delayed tasks"
            actions={<StatusPill kind="danger" label={`${delayed.length} flagged`} />}
          />
          <div>
            {delayed.length === 0 ? (
              <p className="empty py-8">No delays. Nice.</p>
            ) : (
              delayed.map((t) => (
                <div key={t.id} className="approval-row py-2.5">
                  <div
                    className="approval-icon"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="approval-meta">
                    <div className="t text-[12.5px]">{t.title}</div>
                    <div className="d">{t.department}</div>
                  </div>
                  <Link to={`/tasks?projectId=${t.projectId}`} className="btn btn-link btn-sm">
                    Update
                  </Link>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── Today's tasks ── */}
      <SectionHeader
        title="What's on for today"
        action={
          <Link to="/tasks" className="btn btn-link btn-sm">
            All tasks <ChevronRight className="w-3 h-3 inline" />
          </Link>
        }
      />
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>Task</th>
              <th>Department</th>
              <th>Status</th>
              <th className="right">Action</th>
            </tr>
          </thead>
          <tbody>
            {todays.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  No active tasks for today.{' '}
                  <Link to="/tasks" className="btn btn-link btn-sm" style={{ display: 'inline', padding: 0 }}>
                    View all tasks →
                  </Link>
                </td>
              </tr>
            ) : (
              todays.map((t) => (
                <tr key={t.id} className={t.isDelayed ? 'delayed' : ''}>
                  <td className="name-cell">{t.title}</td>
                  <td>{t.department ?? '—'}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td className="right">
                    <Link to="/tasks" className="btn btn-link btn-sm">Update</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
