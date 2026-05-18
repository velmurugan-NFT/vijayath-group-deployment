import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ApprovalQueueRow({
  icon,
  title,
  description,
  amount,
  scope,
  selected,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  amount: ReactNode;
  scope?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn('approval-row cursor-pointer', selected && 'bg-vijayanth-green-50')}
      style={selected ? { borderLeft: '3px solid var(--gold)', paddingLeft: 15 } : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="approval-icon">{icon}</div>
      <div className="approval-meta">
        <div className="t">{title}</div>
        <div className="d">{description}</div>
      </div>
      <div className="approval-amt">
        {amount}
        {scope && <div className="text-[11px] text-vijayanth-muted font-sans font-normal mt-0.5">{scope}</div>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-vijayanth-muted-2 shrink-0" />
    </div>
  );
}
