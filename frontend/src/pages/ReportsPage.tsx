import { useState } from 'react';
import { apiDownload } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/design/Card';
import { toast } from 'sonner';
import { Download, TrendingUp, BarChart3, Wallet, Truck, Clock, ClipboardList, Mail, Receipt, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const REPORTS: { type: string; name: string; file: string; desc: string; icon: LucideIcon }[] = [
  { type: 'pl', name: 'Project P&L', file: 'project-pl.xlsx', desc: 'Estimated vs actual cost, profit, margin %', icon: TrendingUp },
  { type: 'budget-variance', name: 'Budget Variance', file: 'budget-variance.xlsx', desc: 'WBS line-level variance with phase split', icon: BarChart3 },
  { type: 'receivables-ageing', name: 'Receivables Ageing', file: 'receivables-ageing.xlsx', desc: 'Customer payments ageing buckets', icon: Wallet },
  { type: 'vendor-spend', name: 'Vendor Spend', file: 'vendor-spend.xlsx', desc: 'Total spend by vendor and category', icon: Truck },
  { type: 'payment-ageing', name: 'Payment Ageing', file: 'payment-ageing.xlsx', desc: 'Approved-vs-paid ageing across POs', icon: Clock },
  { type: 'daily-status', name: 'Daily Work Status', file: 'daily-status.xlsx', desc: 'Submission rate by Project Head', icon: ClipboardList },
  { type: 'weekly-digest', name: 'Weekly Digest', file: 'weekly-digest.xlsx', desc: 'Portfolio summary · role-scoped', icon: Mail },
  { type: 'gst-register', name: 'GST Register', file: 'gst-register.xlsx', desc: 'Purchase + sales GST register', icon: Receipt },
  { type: 'asset-register', name: 'Asset Register', file: 'asset-register.xlsx', desc: 'Commissioned modules, inverters', icon: Package },
];

export function ReportsPage() {
  const [from, setFrom] = useState('2025-01-01');
  const [to, setTo] = useState('2026-12-31');

  const exportReport = async (type: string, filename: string) => {
    try {
      if (['pl', 'budget-variance', 'receivables-ageing'].includes(type)) {
        await apiDownload(`/reports/${type}?from=${from}&to=${to}`, filename);
      } else {
        toast.info('Report template ready — export via Excel for demo types');
        return;
      }
      toast.success('Report downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="9 standard reports · Excel export · role-scoped per BRD" />
      <Card className="card-pad mb-6 flex flex-wrap gap-4 items-end">
        <div className="field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </Card>
      <div className="resp-3-1">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.type} className="card-pad hover:border-vijayanth-gold transition-colors cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-vijayanth-green-50 flex items-center justify-center text-vijayanth-green">
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                <div className="font-semibold text-sm">{r.name}</div>
              </div>
              <p className="text-[12.5px] text-vijayanth-muted leading-relaxed min-h-[36px]">{r.desc}</p>
              <div className="flex gap-2 mt-3.5">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportReport(r.type, r.file)}>
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
