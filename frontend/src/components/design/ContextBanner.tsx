import { ReactNode } from 'react';

export function ContextBanner({ children }: { children: ReactNode }) {
  return <div className="context-banner">{children}</div>;
}
