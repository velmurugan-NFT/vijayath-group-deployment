import { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export function FormDialog({
  open,
  onOpenChange,
  title,
  children,
  onSubmit,
  submitLabel = 'Save',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-vijayanth-line">
        <DialogHeader>
          <DialogTitle className="text-vijayanth-green-deep">{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          {children}
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{submitLabel}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
