import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, ListTodo, Truck, FileText, CreditCard,
  Receipt, Wallet, Files, BarChart3, Shield, Settings, CheckCircle, Package, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { BrandMark } from '@/components/design/BrandMark';
import { cn } from '@/lib/utils';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles?: string[]; badgeKey?: 'approvals' | 'tasks' };

const NAV_MAIN: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/approvals', label: 'Approvals', icon: CheckCircle, badgeKey: 'approvals' },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, badgeKey: 'tasks' },
  { to: '/daily-status', label: 'Daily Status', icon: ClipboardList },
];

const NAV_PROC: NavItem[] = [
  { to: '/vendors', label: 'Vendors', icon: Truck },
  { to: '/quotations', label: 'POs & Quotes', icon: FileText },
  { to: '/grn', label: 'GRN', icon: Package },
  { to: '/vendor-invoices', label: 'Vendor Invoices', icon: Receipt },
  { to: '/payments', label: 'Payments', icon: CreditCard },
];

const NAV_FIN: NavItem[] = [
  { to: '/invoices', label: 'Customer Invoices', icon: Wallet },
  { to: '/receivables', label: 'Receivables', icon: Wallet },
  { to: '/documents', label: 'Documents', icon: Files },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

const NAV_ADMIN: NavItem[] = [
  { to: '/audit', label: 'Audit Log', icon: Shield, roles: ['SUPER_ADMIN', 'CORPORATE_OFFICE'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
];

function NavGroup({
  heading,
  items,
  badges,
  onNavigate,
}: {
  heading?: string;
  items: NavItem[];
  badges: { pendingApprovals: number; delayedTasks: number };
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const visible = items.filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  return (
    <>
      {heading && <div className="sidebar-section">{heading}</div>}
      {visible.map((item) => {
        const Icon = item.icon;
        const badge =
          item.badgeKey === 'approvals' && badges.pendingApprovals > 0
            ? badges.pendingApprovals
            : item.badgeKey === 'tasks' && badges.delayedTasks > 0
              ? badges.delayedTasks
              : null;
        const badgeKind = item.badgeKey === 'tasks' ? 'amber' : '';
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => cn('nav-item', isActive && 'active')}
          >
            <Icon className="nav-icon w-4 h-4 shrink-0 opacity-80" />
            <span>{item.label}</span>
            {badge != null && <span className={cn('nav-badge', badgeKind)}>{badge}</span>}
          </NavLink>
        );
      })}
    </>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const [badges, setBadges] = useState({ pendingApprovals: 0, delayedTasks: 0 });

  useEffect(() => {
    api<{ pendingApprovals: number; delayedTasks: number }>('/nav/summary')
      .then(setBadges)
      .catch(() => {});
  }, [user]);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <aside className={cn('sidebar', mobileOpen && 'open')}>
      <div className="sidebar-brand">
        <BrandMark />
        <div className="brand-text">
          <div className="name">VIJAYANTH</div>
          <div className="sub">Renewable Energy</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavGroup items={NAV_MAIN} badges={badges} onNavigate={onClose} />
        <NavGroup heading="Procurement" items={NAV_PROC} badges={badges} onNavigate={onClose} />
        <NavGroup heading="Finance & Records" items={NAV_FIN} badges={badges} onNavigate={onClose} />
        <NavGroup heading="Admin" items={NAV_ADMIN} badges={badges} onNavigate={onClose} />
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="who-name">{user?.name}</div>
          <div className="who-role">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
        </div>
        <button type="button" onClick={() => logout()} className="text-[10px] text-white/50 hover:text-white underline shrink-0">
          Logout
        </button>
      </div>
    </aside>
  );
}
