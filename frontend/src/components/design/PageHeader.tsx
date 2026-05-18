import { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-h">
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
