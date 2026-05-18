import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  variant = 'default',
  accent,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  accent?: boolean;
}) {
  const variantClass =
    variant === 'danger' ? 'kpi-danger' : variant === 'warning' ? 'kpi-warn' : variant === 'success' ? 'kpi-success' : '';
  const inner = (
    <div className={cn('kpi', accent && 'kpi-accent', variantClass, href && 'cursor-pointer hover:shadow-brand transition-shadow')}>
      <div className="label">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="delta">{sub}</div>}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}
