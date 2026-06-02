import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/formatDate';
import { type DocGroup, wbsLabel } from '@/lib/documentGroups';
import { FileDown, Pencil, Trash2 } from 'lucide-react';

function NotesCell({ notes }: { notes: string | null }) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  if (!notes) return <>—</>;

  return (
    <>
      <span
        className="doc-notes-cell"
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          const rect = el.getBoundingClientRect();
          setTooltip({ text: notes, x: rect.left, y: rect.top });
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {notes}
      </span>
      {tooltip && (
        <div
          className="doc-notes-tooltip"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateY(calc(-100% - 6px))' }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
}

const actionBtnStyle = {
  download: {
    background: 'none' as const,
    border: '1px solid var(--line)',
    color: 'var(--vijayanth-green, #134d22)',
    fontWeight: 600,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  delete: {
    background: 'none' as const,
    border: '1px solid #fca5a5',
    color: '#ef4444',
    fontWeight: 600,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
};

type DocumentsTableProps = {
  groups: DocGroup[];
  showProject?: boolean;
  onEdit?: (group: DocGroup) => void;
  onDelete?: (group: DocGroup) => void;
  onDownload?: (group: DocGroup) => void;
  /** When set, edit/delete navigate here instead of using callbacks */
  manageHref?: string;
  emptyMessage?: string;
};

export function DocumentsTable({
  groups,
  showProject = true,
  onEdit,
  onDelete,
  onDownload,
  manageHref,
  emptyMessage = 'No documents found',
}: DocumentsTableProps) {
  const colSpan = showProject ? 8 : 7;

  const renderEdit = (group: DocGroup) => {
    const btn = (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title="Edit document"
        style={{ padding: '0 8px', color: 'var(--muted)' }}
        onClick={() => onEdit?.(group)}
      >
        <Pencil style={{ width: 13, height: 13 }} />
      </button>
    );
    if (manageHref) {
      return (
        <Link to={manageHref} className="btn btn-ghost btn-sm" title="Edit on Documents page" style={{ padding: '0 8px', color: 'var(--muted)' }}>
          <Pencil style={{ width: 13, height: 13 }} />
        </Link>
      );
    }
    return onEdit ? btn : null;
  };

  const renderDelete = (group: DocGroup) => {
    const btn = (
      <button
        type="button"
        className="btn btn-sm"
        title="Delete document"
        style={actionBtnStyle.delete}
        onClick={() => onDelete?.(group)}
      >
        <Trash2 style={{ width: 13, height: 13 }} />
      </button>
    );
    if (manageHref) {
      return (
        <Link to={manageHref} className="btn btn-sm" title="Delete on Documents page" style={actionBtnStyle.delete}>
          <Trash2 style={{ width: 13, height: 13 }} />
        </Link>
      );
    }
    return onDelete ? btn : null;
  };

  return (
    <table className="tbl" style={{ tableLayout: 'fixed', width: '100%' }}>
      <thead>
        <tr>
          {showProject && <th>Project</th>}
          <th>WBS item</th>
          <th>Type</th>
          <th>Date</th>
          <th>Notes</th>
          <th>File</th>
          <th>Uploaded</th>
          <th style={{ textAlign: 'center' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const d = group.docs[0];
          return (
            <tr key={group.key}>
              {showProject && <td className="name-cell">{d.project.name}</td>}
              <td className="doc-wbs-cell">{wbsLabel(d.wbsLineItem)}</td>
              <td>{d.category ?? '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.documentDate ? formatDate(d.documentDate) : '—'}</td>
              <td>
                <NotesCell notes={d.notes} />
              </td>
              <td>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {group.docs.map((file) => (
                    <li key={file.id} className="mono text-[11px]" style={{ marginBottom: 2, color: 'var(--muted)' }}>
                      {file.filename}
                    </li>
                  ))}
                </ul>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(d.createdAt)}</td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {renderEdit(group)}
                  {onDownload && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={group.docs.length > 1 ? `Download ${group.docs.length} files` : 'Download'}
                      style={actionBtnStyle.download}
                      onClick={() => onDownload(group)}
                    >
                      <FileDown style={{ width: 13, height: 13 }} />
                    </button>
                  )}
                  {renderDelete(group)}
                </div>
              </td>
            </tr>
          );
        })}
        {groups.length === 0 && (
          <tr>
            <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem' }}>
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
