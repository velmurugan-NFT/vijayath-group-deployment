import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectHeadDashboard } from '@/pages/dashboard/ProjectHeadDashboard';
import { SectorHeadDashboard } from '@/pages/dashboard/SectorHeadDashboard';
import { CorporateDashboard } from '@/pages/dashboard/CorporateDashboard';
import { SuperAdminDashboard } from '@/pages/dashboard/SuperAdminDashboard';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { RefreshCw, Upload, Plus } from 'lucide-react';
import { useProjectContext } from '@/context/ProjectContext';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function DashboardPage() {
  const { user } = useAuth();
  const { activeProject } = useProjectContext();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

          const load = useCallback(() => {
            setLoading(true);
            api<Record<string, unknown>>('/dashboard')
              .then(setData)
              .catch(() => setData(null))
              .finally(() => setLoading(false));
          }, []);

          useEffect(() => { load(); }, [user, load]);

          if (loading) {
            return (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            );
          }
          if (!data) return <p className="text-vijayanth-danger">Failed to load dashboard. Is the API running on port 3001?</p>;

          const firstName = user?.name?.split(' ')[0] ?? '';
          const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role;
        const projects =
          (data.projects as {
            id?: string;
            name: string;
          }[]) ?? [];

        const filteredProjects =
          activeProject
            ? projects.filter(
                (p) =>
                  p.id === activeProject.id
              )
            : projects;

        const subtitle =
        `${todayLabel()} · ${
          filteredProjects[0]?.name ??
          'Portfolio'
        } · ${roleLabel}`;

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}.`}
        subtitle={subtitle}
        actions={
          <>
            {user?.role === 'PROJECT_HEAD' && (
              <>
                <Link to="/daily-status" className="btn btn-ghost"><Upload className="w-3.5 h-3.5" /> Daily status</Link>
                <Link to="/quotations" className="btn btn-primary"><Plus className="w-3.5 h-3.5" /> Raise request</Link>
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          </>
        }
      />
      {user?.role === 'PROJECT_HEAD' && <ProjectHeadDashboard data={data} />}
      {user?.role === 'SECTOR_HEAD' && <SectorHeadDashboard data={data} />}
      {user?.role === 'CORPORATE_OFFICE' && <CorporateDashboard data={data} />}
      {user?.role === 'SUPER_ADMIN' && <SuperAdminDashboard data={data} />}
    </div>
  );
}
