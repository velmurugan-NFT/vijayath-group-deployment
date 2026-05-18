import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AppTabs({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('tabs', className)}>{children}</div>;
}

export function AppTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number | string;
}) {
  return (
    <button type="button" className={cn('tab', active && 'active')} onClick={onClick}>
      {label}
      {count != null && <span className="count">{count}</span>}
    </button>
  );
}
