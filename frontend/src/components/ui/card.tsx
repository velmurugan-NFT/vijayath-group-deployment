import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-vijayanth-border bg-white shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-4 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold text-vijayanth-green', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground text-gray-500', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-0', className)} {...props} />;
}
