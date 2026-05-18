import { Link } from 'react-router-dom';
import { KpiCard } from '@/components/KpiCard';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { formatDate } from '@/lib/formatDate';
import { Users, Activity, Settings } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/roleUtils';

export function SuperAdminDashboard({ data }: { data: Record<string, unknown> }) {
  const stats = data.systemStats as { usersByRole: { role: string; _count: number }[]; auditToday: number } | null;
  const recent = (data.recentAudit as { action: string; user: { name: string }; createdAt: string }[]) ?? [];

  return (
    <>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <KpiCard label="Users" value={String(stats?.usersByRole.reduce((s, u) => s + u._count, 0) ?? 0)} icon={Users} href="/settings" accent />
        <KpiCard label="Audit events today" value={String(stats?.auditToday ?? 0)} icon={Activity} href="/audit" />
        <KpiCard label="System" value="Healthy" variant="success" icon={Settings} href="/settings" />
      </div>
      {stats && (
        <Card className="mb-5">
          <CardHeader title="Users by role" />
          <CardBody className="grid grid-cols-2 gap-2">
            {stats.usersByRole.map((u) => (
              <div key={u.role} className="flex justify-between text-sm p-3 bg-vijayanth-surface-2 rounded-lg border border-vijayanth-line">
                <span>{ROLE_LABELS[u.role] ?? u.role}</span>
                <span className="font-semibold">{u._count}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Recent system activity" />
        <CardBody className="space-y-2">
          {recent.map((a, i) => (
            <p key={i} className="text-sm text-vijayanth-ink-2">
              {formatDate(a.createdAt)} — <strong>{a.user.name}</strong> — {a.action}
            </p>
          ))}
          <Link to="/audit" className="btn btn-link btn-sm">View full audit log →</Link>
        </CardBody>
      </Card>
    </>
  );
}
