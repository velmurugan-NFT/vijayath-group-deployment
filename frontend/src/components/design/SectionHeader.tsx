import { ReactNode } from 'react';

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-h">
      <div>
        <h2>{title}</h2>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
