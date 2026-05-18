import { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';

type Col<T> = { key: string; header: string; render: (row: T) => ReactNode; className?: string };

type Props<T> = {
  columns: Col<T>[];
  data: T[];
  keyFn: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({ columns, data, keyFn, emptyMessage = 'No records', onRowClick }: Props<T>) {
  if (!data.length) return <EmptyState message={emptyMessage} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => <TableHead key={c.key} className={c.className}>{c.header}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={keyFn(row)} className={onRowClick ? 'cursor-pointer hover:bg-vijayanth-row' : ''} onClick={() => onRowClick?.(row)}>
            {columns.map((c) => <TableCell key={c.key} className={c.className}>{c.render(row)}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
