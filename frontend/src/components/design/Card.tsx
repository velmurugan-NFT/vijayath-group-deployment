import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="card-h">
      <div>
        <h3>{title}</h3>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card-body', className)}>{children}</div>;
}
