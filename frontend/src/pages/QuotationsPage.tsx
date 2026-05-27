import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/formatINR';
import { formatDate } from '@/lib/formatDate';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { useProjectContext } from '@/context/ProjectContext';
import { Loader2, ChevronRight, PlusCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface QuoteRow {
  id: string; amount: number; deliveryDays: number;
  isWinner?: boolean; vendor: { id: string; name: string };
}
interface QR {
  id: string; title: string; status: string; createdAt: string;
  project: { id: string; name: string };
  lineItem?: { description: string };
  quotations: QuoteRow[];
}
interface PO {
  id: string; poNumber: string; title: string; status: string;
  totalAmount: number; createdAt: string;
  vendor: { name: string }; project: { name: string };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  QUOTES_PENDING:  { label: 'Quotes pending',  cls: 'pill-warn'    },
  COMPARISON:      { label: 'Quotes received',  cls: 'pill-info'    },
  WINNER_SELECTED: { label: 'Winner selected',  cls: 'pill-success' },
  PO_CREATED:      { label: 'PO created',       cls: 'pill-success' },
  CANCELLED:       { label: 'Cancelled',        cls: 'pill-neutral' },
  DRAFT:           { label: 'Draft',            cls: 'pill-neutral' },
};

function QRPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status.replace(/_/g, ' '), cls: 'pill-neutral' };
  return <span className={`pill ${m.cls}`}><span className="dot" />{m.label}</span>;
}

// scrollable table wrapper
const scrollWrap: React.CSSProperties = {
  overflowX: 'auto',
  overflowY: 'auto',
  maxHeight: 420,
};

export function QuotationsPage() {
  const navigate = useNavigate();
  const { activeProject, loading: projectsLoading } = useProjectContext();

  const [requests, setRequests] = useState<QR[]>([]);
  const [pos,      setPos]      = useState<PO[]>([]);
  const [loadingQR, setLoadingQR] = useState(false);
  const [loadingPO, setLoadingPO] = useState(false);

  const pid = activeProject?.id ?? '';

  // Load quotation requests whenever active project changes
  useEffect(() => {
    if (!pid) { setRequests([]); return; }
    setLoadingQR(true);
    api<QR[]>(`/quotations?projectId=${pid}`)
      .then(setRequests).catch(() => setRequests([]))
      .finally(() => setLoadingQR(false));
  }, [pid]);

  // Load POs whenever active project changes
  useEffect(() => {
    if (!pid) { setPos([]); return; }
    setLoadingPO(true);
    // /pos returns all POs in scope; filter by active project
    api<PO[]>('/pos')
      .then((all) => setPos(pid ? all.filter((p) => (p as any).projectId === pid || p.project?.name === activeProject?.name) : all))
      .catch(() => setPos([]))
      .finally(() => setLoadingPO(false));
  }, [pid]);

  if (projectsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 8, color: 'var(--muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="POs & Quotes"
        subtitle={activeProject ? activeProject.name : 'Select a project from the top bar'}
        // actions={
        //   // <Link to="/capture-quotes" className="btn btn-primary">
        //   //   <PlusCircle className="w-3.5 h-3.5" /> New quotation request
        //   // </Link>
        // }
      />

      {!pid ? (
        <Card>
          <CardBody>
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2.5rem' }}>
              Select a project from the top bar to view quotation requests and purchase orders.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ══ SECTION 1: Quotation Requests ══════════════════════════════ */}
          <Card className="mb-5">
            <CardHeader
              title="Quotation Requests"
              subtitle={`${requests.length} request${requests.length !== 1 ? 's' : ''} · click View to add quotes or select a winner`}
            actions={
  <Link
    to="/capture-quotes"
    className="btn btn-sm"
    style={{
      background:  'var(--success)',
      color: 'white',
      border: 'none',
      fontWeight: 600,
    }}
  >
    <PlusCircle className="w-3.5 h-3.5" />
    New Quotation Request
  </Link>
}
            />
            <CardBody className="p-0">
              {loadingQR ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem', gap: 8, color: 'var(--muted)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div style={scrollWrap}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Budget line</th>
                        <th>Date</th>
                        <th className="right">Vendors quoted</th>
                        <th className="right">Lowest quote</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => {
                        const lowestAmt = r.quotations.length > 0
                          ? Math.min(...r.quotations.map((q) => q.amount)) : null;
                        const winner = r.quotations.find((q) => q.isWinner);
                        return (
                          <tr
                            key={r.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/quotations/${r.id}`)}
                          >
                            <td className="name-cell" style={{ fontWeight: 600 }}>{r.title}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                              {r.lineItem?.description ?? '—'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                              {formatDate(r.createdAt)}
                            </td>
                            <td className="right" style={{ fontSize: '0.85rem' }}>
                              {r.quotations.length > 0
                                ? `${r.quotations.length} vendor${r.quotations.length !== 1 ? 's' : ''}`
                                : <span style={{ color: 'var(--muted)' }}>None yet</span>
                              }
                            </td>
                            <td className="right amt">
                              {lowestAmt != null ? formatINR(lowestAmt) : '—'}
                            </td>
                            <td>
                              <QRPill status={r.status} />
                            {winner && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                                Selected: {winner.vendor.name}
                              </div>
                            )}
                            </td>
                            <td className="right" onClick={(e) => e.stopPropagation()}>
                              <Link
                                to={`/quotations/${r.id}`}
                                className="btn btn-link btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
                              >
                                View <ChevronRight className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                      {requests.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>
                            No quotation requests yet.{' '}
                            <Link to="/capture-quotes" style={{ color: 'var(--green)', textDecoration: 'underline' }}>
                              Raise one →
                            </Link>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {/* ══ SECTION 2: Purchase Orders ═════════════════════════════════ */}
          <Card>
            <CardHeader
              title="Purchase Orders"
              subtitle={`${pos.length} PO${pos.length !== 1 ? 's' : ''} · all statuses`}
            />
            <CardBody className="p-0">
              {loadingPO ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem', gap: 8, color: 'var(--muted)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div style={scrollWrap}>
                  <table className="tbl">
                 <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Title</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th className="right">Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                    <tbody>
                      {pos.map((p) => (
                        <tr
                          key={p.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/pos/${p.id}`)}
                        >
                          <td className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {p.poNumber}
                          </td>
                          <td className="name-cell">{p.title}</td>
                          <td style={{ fontSize: '0.85rem' }}>{p.vendor.name}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {formatDate(p.createdAt)}
                          </td>
                          <td className="right amt" style={{ fontWeight: 700 }}>{formatINR(p.totalAmount)}</td>
                          <td><StatusBadge status={p.status} /></td>
                          <td className="right" onClick={(e) => e.stopPropagation()}>
                            <Link
                              to={`/pos/${p.id}`}
                              className="btn btn-link btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
                            >
                              View <ChevronRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {pos.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>
                            No purchase orders yet for this project.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
