import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { N, sumAmounts } from '../lib/money.js';

const router = Router();

router.get('/receivables', requireAuth, async (req: AuthRequest, res) => {
  const pf = await projectFilter(req.user!);
  const projects = await prisma.project.findMany({
    where: { ...pf, parentId: { not: null } },
    include: { customerReceipts: true, customerInvoices: true },
  });

  const today = new Date();
  const data = projects.map((p) => {
    const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
    const billable = N(p.billable);
    const balance = billable - received;
    const pct = billable > 0 ? Math.round((received / billable) * 100) : 0;

    const ageing = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: balance };
    for (const inv of p.customerInvoices) {
      const days = Math.floor((today.getTime() - inv.issuedAt.getTime()) / 86400000);
      const amt = N(inv.amount);
      if (days <= 30) ageing.d0_30 += amt;
      else if (days <= 60) ageing.d31_60 += amt;
      else if (days <= 90) ageing.d61_90 += amt;
      else ageing.d90plus += amt;
    }

    return { projectId: p.id, name: p.name, billable, received, balance, pctCollected: pct, ageing };
  });
  res.json(data);
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const pf = await projectFilter(req.user!);
  const receipts = await prisma.customerReceipt.findMany({
    where: { project: pf },
    include: { project: true },
    orderBy: { receivedAt: 'desc' },
  });
  res.json(receipts);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { projectId, amount, receivedAt, reference } = req.body;
  const ctx = await getProjectContext(projectId);
  assertCan(req.user!, 'create', ctx ?? undefined);
  const receipt = await prisma.customerReceipt.create({
    data: { projectId, amount, receivedAt: new Date(receivedAt), reference },
    include: { project: true },
  });
  await writeAudit(req.user!.id, 'RECEIPT_RECORDED', 'CustomerReceipt', receipt.id, { amount });
  res.status(201).json(receipt);
});

export default router;
