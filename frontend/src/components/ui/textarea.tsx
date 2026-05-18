import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-vijayanth-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vijayanth-gold disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
