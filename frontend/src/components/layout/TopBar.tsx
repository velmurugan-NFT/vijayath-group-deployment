import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu, Bell, Search, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProjectContext } from '@/context/ProjectContext';
import { api } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DemoUser { id: string; email: string; name: string; role: string }

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/approvals': 'Approvals',
  '/projects': 'Projects',
  '/tasks': 'Tasks',
  '/daily-status': 'Daily Status',
  '/vendors': 'Vendors',
  '/quotations': 'POs & Quotes',
  '/grn': 'GRN',
  '/vendor-invoices': 'Vendor Invoices',
  '/payments': 'Payments',
  '/invoices': 'Customer Invoices',
  '/receivables': 'Receivables',
  '/documents': 'Documents',
  '/reports': 'Reports',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
};

export function TopBar({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const { user, switchDemoUser } = useAuth();
  const { projects, activeProject, setActiveProjectId } = useProjectContext();
  const location = useLocation();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    api<DemoUser[]>('/auth/demo-users').then(setDemoUsers).catch(() => {});
  }, [user]);

  const segments = location.pathname.split('/').filter(Boolean);
  const basePath = '/' + (segments[0] ?? '');
  const title = routeTitles[basePath] ?? 'Vijayanth';
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectCrumb = projectMatch && activeProject?.id === projectMatch[1] ? activeProject.name : null;

  return (
    <header className="topbar">
      <div className="crumbs">
        <button type="button" className="icon-btn menu-btn mr-1" onClick={onMenuOpen} aria-label="Menu">
          <Menu className="w-4 h-4" />
        </button>
        <Link to="/" className="hover:text-vijayanth-ink">Home</Link>
        <ChevronRight className="w-2.5 h-2.5 text-vijayanth-muted-2" />
        <span className={!projectCrumb ? 'crumb-current' : ''}>{title}</span>
        {projectCrumb && (
          <>
            <ChevronRight className="w-2.5 h-2.5 text-vijayanth-muted-2" />
            <Link to={`/projects/${activeProject?.id}`} className="crumb-current hover:underline truncate max-w-[200px]">
              {projectCrumb}
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="search-input hidden md:flex">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input placeholder="Search projects, POs, vendors…" />
          <span className="mono text-[10px] bg-white border border-vijayanth-line px-1 rounded text-vijayanth-muted-2 ml-auto">⌘K</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Notifications">
          <Bell className="w-4 h-4" />
          <span className="dot" />
        </button>
                <Select
          value={activeProject?.id ?? '_none'}
          onValueChange={(v) => {
            const projectId = v === '_none' ? null : v;

            setActiveProjectId(projectId);

            // Optional: save selected project after refresh
            localStorage.setItem(
              'activeProjectId',
              projectId ?? ''
            );
          }}
        >
          <SelectTrigger className="w-[160px] h-[34px] text-xs border-vijayanth-line bg-vijayanth-surface-2">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="_none">
              All projects
            </SelectItem>

            {projects.map((p) => (
              <SelectItem
                key={p.id}
                value={p.id}
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="role-chip" title="Demo only — switch active user">
          <Zap className="w-3 h-3" />
          <span>Demo:</span>
          <select
            value={user?.id ?? ''}
            onChange={(e) => e.target.value && switchDemoUser(e.target.value)}
          >
            {demoUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name.split(' ')[0]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
