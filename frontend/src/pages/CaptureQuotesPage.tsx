import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { useProjectContext } from '@/context/ProjectContext';
import { Loader2, ArrowRight } from 'lucide-react';

interface LineItem { id: string; description: string }
interface WBSCat   { id: string; name: string; lineItems: LineItem[] }

export function CaptureQuotesPage() {
  const navigate = useNavigate();
  const { activeProject, loading: projectsLoading } = useProjectContext();

  const [wbs,        setWbs]        = useState<WBSCat[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({ lineItemId: '', title: '', description: '' });

  const pid = activeProject?.id ?? '';

  useEffect(() => {
    if (!pid) { setWbs([]); return; }
    setWbsLoading(true);
    api<WBSCat[]>(`/projects/${pid}/wbs`)
      .then(setWbs).catch(() => setWbs([]))
      .finally(() => setWbsLoading(false));
    setForm({ lineItemId: '', title: '', description: '' });
  }, [pid]);

  const allLineItems = wbs.flatMap((c) => c.lineItems.map((l) => ({ ...l, catName: c.name })));

  const submit = async () => {
    if (!pid)               { toast.error('Select a project from the top bar first'); return; }
    if (!form.lineItemId)   { toast.error('Select a budget line item'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const qr = await api<{ id: string }>('/quotations', {
        method: 'POST',
        body: JSON.stringify({
          projectId:   pid,
          lineItemId:  form.lineItemId,
          title:       form.title.trim(),
          description: form.description.trim() || undefined,
        }),
      });
      toast.success('Quotation request created — now add vendor quotes');
      navigate(`/quotations/${qr.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quotation request');
    } finally {
      setSaving(false);
    }
  };

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
        title="New Quotation Request"
        subtitle={activeProject ? `Project: ${activeProject.name}` : 'Select a project from the top bar to continue'}
        actions={<Link to="/quotations" className="btn btn-ghost">← Back to POs &amp; Quotes</Link>}
      />

      {!pid ? (
        <Card>
          <CardBody>
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2.5rem' }}>
              Select a project from the top bar, then come back here to raise a quotation request.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Request details"
            subtitle={`Creating for: ${activeProject?.name}`}
          />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>

              <div className="field">
                <label>Budget line item *</label>
                {wbsLoading ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading WBS…
                  </p>
                ) : allLineItems.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    No WBS items found. Add them in the project's WBS tab first.
                  </p>
                ) : (
                  <select
                    value={form.lineItemId}
                    onChange={(e) => {
                      const li = allLineItems.find((l) => l.id === e.target.value);
                      setForm({ ...form, lineItemId: e.target.value, title: li?.description ?? form.title });
                    }}
                  >
                    <option value="">— select —</option>
                    {wbs.map((cat) => (
                      <optgroup key={cat.id} label={cat.name}>
                        {cat.lineItems.map((l) => (
                          <option key={l.id} value={l.id}>{l.description}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>

              <div className="field">
                <label>Title *</label>
                <input
                  placeholder="e.g. PV Modules supply — 1 MW"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Description / scope</label>
                <input
                  placeholder="Specs, quantity, standards, requirements…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button" className="btn btn-primary"
                  disabled={saving || !form.lineItemId || !form.title.trim()}
                  onClick={submit}
                >
                  {saving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : <><ArrowRight className="w-3.5 h-3.5" /> Create &amp; add vendor quotes</>
                  }
                </button>
                <Link to="/quotations" className="btn btn-ghost">Cancel</Link>
              </div>

            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
