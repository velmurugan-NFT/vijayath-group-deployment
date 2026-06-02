import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { formatINR } from '@/lib/formatINR';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/design/Card';
import { FormDialog } from '@/components/FormDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

const DEFAULT_APPROVAL_LIMIT = 1_000_000; // 10 lakh

const NAV = ['Users', 'Sectors', 'Templates', 'Approval thresholds', 'Bank accounts', 'System config', 'Reset demo data'];

export function SettingsPage() {
  const [section, setSection] = useState(0);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [sectors, setSectors] = useState<Record<string, unknown>[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, unknown>[]>([]);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '', name: '', role: 'PROJECT_HEAD', password: 'demo123',
    approvalLimit: DEFAULT_APPROVAL_LIMIT,
  });

  const load = () => {
    api<Record<string, unknown>[]>('/settings/users').then(setUsers);
    api<Record<string, unknown>[]>('/settings/sectors').then(setSectors);
    api<Record<string, unknown>[]>('/settings/thresholds').then(setThresholds);
    api<Record<string, unknown>[]>('/settings/templates').then(setTemplates);
  };
  useEffect(() => { load(); }, []);

  const resetDemo = async () => {
    if (!confirm('Reset all demo data?')) return;
    await api('/settings/reset-demo', { method: 'POST' });
    toast.success('Demo data reset — refresh page');
    setTimeout(() => window.location.reload(), 2000);
  };

  const createUser = async () => {
    await api('/settings/users', { method: 'POST', body: JSON.stringify(userForm) });
    toast.success('User created');
    setUserOpen(false);
    load();
  };

  const saveUserApprovalLimit = async (userId: string, approvalLimit: number) => {
    await api(`/settings/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ approvalLimit }) });
    toast.success('Approval limit updated');
    load();
  };

  const saveThreshold = async (role: string, ceiling: number) => {
    await api(`/settings/thresholds/${role}`, { method: 'PATCH', body: JSON.stringify({ ceiling }) });
    toast.success('Threshold updated');
    load();
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="System administration · users, sectors, thresholds, templates"
        actions={section === 6 ? <button type="button" className="btn btn-gold" onClick={resetDemo}>Reset demo data</button> : undefined}
      />
      <div className="grid gap-6" style={{ gridTemplateColumns: '240px 1fr' }}>
        <Card className="h-fit">
          {NAV.map((s, i) => (
            <button
              key={s}
              type="button"
              className={cn('settings-nav-item w-full text-left', section === i && 'active')}
              onClick={() => setSection(i)}
            >
              {s}
            </button>
          ))}
        </Card>

        <Card>
          {section === 0 && (
            <>
              <CardHeader title="Users" subtitle="Per-user approval limit (default ₹10 lakh)" actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setUserOpen(true)}><Plus className="w-3 h-3" /> Add user</button>} />
              <CardBody className="p-0">
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Approval limit</th></tr></thead>
                  <tbody>{users.map((u) => (
                    <tr key={String(u.id)}>
                      <td className="name-cell">{String(u.name)}</td>
                      <td>{String(u.email)}</td>
                      <td>{ROLE_LABELS[String(u.role)] ?? String(u.role)}</td>
                      <td>
                        <input
                          type="number"
                          className="h-8 w-36 border border-vijayanth-line rounded-md px-2 text-sm"
                          defaultValue={Number(u.approvalLimit ?? DEFAULT_APPROVAL_LIMIT)}
                          onBlur={(e) => saveUserApprovalLimit(String(u.id), Number(e.target.value))}
                        />
                        <span className="text-xs text-vijayanth-muted ml-2">{formatINR(Number(u.approvalLimit ?? DEFAULT_APPROVAL_LIMIT))}</span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardBody>
            </>
          )}
          {section === 1 && (
            <>
              <CardHeader title="Sectors" />
              <CardBody>{sectors.map((s) => <p key={String(s.id)} className="text-sm py-1">{String(s.name)}</p>)}</CardBody>
            </>
          )}
          {section === 2 && (
            <>
              <CardHeader title="Templates" />
              <CardBody>{templates.map((t) => <p key={String(t.id)} className="text-sm py-1">{String(t.name)}</p>)}</CardBody>
            </>
          )}
          {section === 3 && (
            <>
              <CardHeader title="Approval thresholds" subtitle="Role-tier fallback when user limit is unset" />
              <CardBody>
                <p className="text-vijayanth-muted text-sm mb-4">Each user has a personal approval limit (default ₹10 lakh). Role thresholds apply only when a user&apos;s limit is zero.</p>
                <div className="space-y-3">
                  {thresholds.map((t) => (
                    <div key={String(t.role)} className="flex items-center gap-4 p-3 bg-vijayanth-surface-2 rounded-lg border border-vijayanth-line">
                      <span className="w-40 text-sm font-medium">{ROLE_LABELS[String(t.role)] ?? String(t.role)}</span>
                      <input type="number" className="h-9 w-44 border border-vijayanth-line rounded-md px-3" defaultValue={Number(t.ceiling ?? 0)} onBlur={(e) => saveThreshold(String(t.role), Number(e.target.value))} />
                    </div>
                  ))}
                </div>
                <div className="note mt-4"><strong>Maker-checker enforced:</strong> approvers cannot approve their own requests.</div>
              </CardBody>
            </>
          )}
          {section === 6 && (
            <CardBody>
              <p className="text-sm text-vijayanth-muted">Reseeds all demo data from the seed script. Super Admin only.</p>
              <button type="button" className="btn btn-gold mt-4" onClick={resetDemo}>Reset demo data</button>
            </CardBody>
          )}
          {section !== 0 && section !== 1 && section !== 2 && section !== 3 && section !== 6 && (
            <CardBody><p className="muted text-sm">Configuration section available in full BRD build.</p></CardBody>
          )}
        </Card>
      </div>

      <FormDialog open={userOpen} onOpenChange={setUserOpen} title="Create user" onSubmit={createUser}>
        <div className="field"><label>Name</label><input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></div>
        <div className="field"><label>Email</label><input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></div>
        <div className="field"><label>Role</label>
          <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
            {Object.keys(ROLE_LABELS).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Approval limit (₹)</label>
          <input
            type="number"
            value={userForm.approvalLimit}
            onChange={(e) => setUserForm({ ...userForm, approvalLimit: Number(e.target.value) })}
          />
          <p className="text-xs text-vijayanth-muted mt-1">Default: ₹10,00,000 (10 lakh)</p>
        </div>
        <div className="field"><label>Password</label><input value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></div>
      </FormDialog>
    </div>
  );
}
