import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan, blockMakerChecker, blockSelfApproval } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { recalcLineItem } from '../lib/budget.js';
import { canRoleApprove } from '../lib/approvals.js';
import { PaymentRequestStatus, POStatus, Role } from '../lib/constants.js';
import { N } from '../lib/money.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items = await prisma.paymentRequest.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { po: { include: { vendor: true } }, project: true, requester: true, approver: true, payment: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, amount, purpose, lineItemId } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lineItems: true } });
    if (!po || po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: 'PO must be approved' });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const pr = await prisma.paymentRequest.create({
      data: {
        projectId: po.projectId, poId, amount, purpose,
        lineItemId: lineItemId ?? po.lineItems[0]?.lineItemId,
        requesterId: req.user!.id, status: PaymentRequestStatus.DRAFT,
      },
      include: { po: { include: { vendor: true, lineItems: true } } },
    });
    res.status(201).json(pr);
  } catch (err) { next(err); }
});

router.post('/:id/submit', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) { res.status(404).json({ error: 'Not found' }); return; }
    const updated = await prisma.paymentRequest.update({
      where: { id: pr.id },
      data: { status: PaymentRequestStatus.PENDING_APPROVAL },
    });
    await writeAudit(req.user!.id, 'PAYMENT_SUBMITTED', 'PaymentRequest', pr.id, { amount: pr.amount, projectId: pr.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { acknowledgeBreach } = req.body;
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(pr.projectId);
    assertCan(req.user!, 'approve', ctx ?? undefined);

    blockSelfApproval(req.user!.id, pr.requesterId);
    const prAmount = N(pr.amount);
  blockMakerChecker(String(prAmount), req.user!.id);
    if (!canRoleApprove(req.user!.role as Role, prAmount)) {
      res.status(403).json({ error: 'Your role cannot approve this amount' });
      return;
    }

    if (pr.lineItemId) {
      const line = await prisma.wBSLineItem.findUnique({ where: { id: pr.lineItemId } });
      if (line && (N(line.paid) + prAmount) > N(line.estimated) && !acknowledgeBreach) {
        res.status(400).json({ error: 'Budget breach acknowledgment required', budgetBreach: true });
        return;
      }
    }

    const updated = await prisma.paymentRequest.update({
      where: { id: pr.id },
      data: { status: PaymentRequestStatus.APPROVED, approverId: req.user!.id, approvedAt: new Date() },
    });
    await writeAudit(req.user!.id, 'PAYMENT_APPROVED', 'PaymentRequest', pr.id, { amount: pr.amount, projectId: pr.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/execute', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { utr } = req.body;
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr || pr.status !== PaymentRequestStatus.APPROVED) {
      res.status(400).json({ error: 'Payment must be approved first' });
      return;
    }
    const ctx = await getProjectContext(pr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const payment = await prisma.payment.create({
      data: { paymentRequestId: pr.id, utr, paidAt: new Date(), amount: pr.amount },
    });
    await prisma.paymentRequest.update({ where: { id: pr.id }, data: { status: PaymentRequestStatus.PAID } });

    if (pr.lineItemId) {
      await prisma.wBSLineItem.update({
        where: { id: pr.lineItemId },
        data: { paid: { increment: pr.amount } },
      });
      await recalcLineItem(pr.lineItemId);
    }

    await writeAudit(req.user!.id, 'PAYMENT_EXECUTED', 'Payment', payment.id, { utr, amount: pr.amount, projectId: pr.projectId });
    res.json({ payment, paymentRequest: pr });
  } catch (err) { next(err); }
});

export default router;