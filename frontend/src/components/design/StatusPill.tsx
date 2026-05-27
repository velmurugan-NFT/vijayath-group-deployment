const STATUS_PILLS: Record<string, { cls: string; label: string }> = {
  COMPLETED:       { cls: 'pill-success', label: 'Completed' },
  IN_PROGRESS:     { cls: 'pill-info',    label: 'In progress' },
  NOT_STARTED:     { cls: 'pill-neutral', label: 'Not started' },
  BLOCKED:         { cls: 'pill-danger',  label: 'Blocked' },
  DELAYED:         { cls: 'pill-danger',  label: 'Delayed' },
  N_A:             { cls: 'pill-neutral', label: 'N/A' },
  DRAFT:           { cls: 'pill-neutral', label: 'Draft' },
  PENDING:         { cls: 'pill-warn',    label: 'Pending' },
  PENDING_APPROVAL:{ cls: 'pill-warn',    label: 'Pending approval' },
  APPROVED:        { cls: 'pill-success', label: 'Approved' },
  REJECTED:        { cls: 'pill-danger',  label: 'Rejected' },
  PAID:            { cls: 'pill-success', label: 'Paid' },
  RAISED:          { cls: 'pill-info',    label: 'Raised' },
  IN_EXECUTION:    { cls: 'pill-info',    label: 'IN EXECUTION' },
  COMMISSIONING:   { cls: 'pill-gold',    label: 'Commissioning' },
  CONFIRMED:       { cls: 'pill-info',    label: 'Confirmed' },
  RETURNED:        { cls: 'pill-warn',    label: 'Returned' },
  SENT_TO_VENDOR:  { cls: 'pill-info',    label: 'Sent to vendor' },
  // Quotation request statuses
  QUOTES_PENDING:  { cls: 'pill-warn',    label: 'Quotes pending' },
  COMPARISON:      { cls: 'pill-info',    label: 'Under comparison' },
  WINNER_SELECTED: { cls: 'pill-success', label: 'Winner selected' },
  PO_CREATED:      { cls: 'pill-success', label: 'PO created' },
  CANCELLED:       { cls: 'pill-neutral', label: 'Cancelled' },
};

export function StatusPill({ status, label, kind }: { status?: string; label?: string; kind?: 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'gold' }) {
  if (status) {
    const p = STATUS_PILLS[status] ?? { cls: 'pill-neutral', label: status.replace(/_/g, ' ') };
    return (
      <span className={`pill ${p.cls}`}>
        <span className="dot" />
        {p.label}
      </span>
    );
  }
  return <span className={`pill pill-${kind ?? 'neutral'}`}>{label}</span>;
}
