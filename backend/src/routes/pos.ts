import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan, blockMakerChecker, blockSelfApproval } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { recalcLineItem } from '../lib/budget.js';
import { canRoleApprove } from '../lib/approvals.js';
import { POStatus, Role } from '../lib/constants.js';
import { N } from '../lib/money.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const pf = await projectFilter(req.user!);
  const projectId = req.query.projectId as string | undefined;
  const pos = await prisma.purchaseOrder.findMany({
    where: { project: projectId ? { ...pf, id: projectId } : pf },
    include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(pos);
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } },
  });
  if (!po) { res.status(404).json({ error: 'Not found' }); return; }
  const ctx = await getProjectContext(po.projectId);
  assertCan(req.user!, 'read', ctx ?? undefined);

  const budgetImpact = await Promise.all(po.lineItems.map(async (li) => {
    const line = await prisma.wBSLineItem.findUnique({ where: { id: li.lineItemId } });
    return {
      lineItemId: li.lineItemId,
      description: li.description,
      currentCommitted: N(line?.committed),
      newCommitted: N(line?.committed) + N(li.amount),
      estimated: N(line?.estimated),
      breach: (N(line?.committed) + N(li.amount)) > N(line?.estimated),
    };
  }));

  res.json({ ...po, budgetImpact });
});

router.post('/:id/submit', requireAuth, async (req: AuthRequest, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po) { res.status(404).json({ error: 'Not found' }); return; }
  const ctx = await getProjectContext(po.projectId);
  assertCan(req.user!, 'update', ctx ?? undefined);

  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: POStatus.PENDING_APPROVAL },
    include: { vendor: true, lineItems: true },
  });
  await writeAudit(req.user!.id, 'PO_SUBMITTED', 'PurchaseOrder', po.id, { poNumber: po.poNumber, amount: po.totalAmount });
  res.json(updated);
});

router.post('/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  const { acknowledgeBreach } = req.body;
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { lineItems: true } });
  if (!po) { res.status(404).json({ error: 'Not found' }); return; }
  const ctx = await getProjectContext(po.projectId);
  assertCan(req.user!, 'approve', ctx ?? undefined);

  blockSelfApproval(req.user!.id, po.requesterId);
  const poAmount = N(po.totalAmount);
  blockMakerChecker(poAmount, req.user!.id, po.requesterId);

  if (!canRoleApprove(req.user!.role as Role, poAmount)) {
    res.status(403).json({ error: 'Your role cannot approve this amount' });
    return;
  }

  const lines = await Promise.all(po.lineItems.map((l) => prisma.wBSLineItem.findUnique({ where: { id: l.lineItemId } })));
  const hasBreach = po.lineItems.some((l, i) => (N(lines[i]?.committed) + N(l.amount)) > N(lines[i]?.estimated));
  if (hasBreach && !acknowledgeBreach) {
    res.status(400).json({ error: 'Budget breach acknowledgment required', budgetBreach: true });
    return;
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: POStatus.APPROVED, approverId: req.user!.id, approvedAt: new Date() },
    include: { vendor: true, lineItems: true },
  });

  for (const li of po.lineItems) await recalcLineItem(li.lineItemId);
  await writeAudit(req.user!.id, 'PO_APPROVED', 'PurchaseOrder', po.id, { poNumber: po.poNumber });
  res.json(updated);
});

router.post('/:id/reject', requireAuth, async (req: AuthRequest, res) => {
  const { reason } = req.body;
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po) { res.status(404).json({ error: 'Not found' }); return; }
  blockSelfApproval(req.user!.id, po.requesterId);
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: POStatus.REJECTED, rejectReason: reason },
  });
  await writeAudit(req.user!.id, 'PO_REJECTED', 'PurchaseOrder', po.id, { reason });
  res.json(updated);
});

router.post('/:id/return', requireAuth, async (req: AuthRequest, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: POStatus.RETURNED },
  });
  res.json(updated);
});

export default router;
