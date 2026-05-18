import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox className="w-10 h-10 mx-auto mb-3 opacity-35" />
      <p>{message}</p>
      {children}
    </div>
  );
}
