import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { QuotationRequestStatus, POStatus } from '../lib/constants.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items = await prisma.quotationRequest.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true, quotations: { include: { vendor: true } }, lineItem: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, lineItemId, title, description } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);
    const qr = await prisma.quotationRequest.create({
      data: { projectId, lineItemId, title, description, requesterId: req.user!.id, status: QuotationRequestStatus.QUOTES_PENDING },
      include: { project: true, lineItem: true },
    });
    res.status(201).json(qr);
  } catch (err) { next(err); }
});

router.post('/:id/quotes', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);
    const { vendorId, amount, deliveryDays, notes } = req.body;
    const q = await prisma.quotation.create({
      data: { requestId: qr.id, vendorId, amount, deliveryDays, notes },
      include: { vendor: true },
    });
    await prisma.quotationRequest.update({ where: { id: qr.id }, data: { status: QuotationRequestStatus.COMPARISON } });
    res.status(201).json(q);
  } catch (err) { next(err); }
});

router.post('/:id/select-winner', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { quotationId, reason } = req.body;
    const qr = await prisma.quotationRequest.findUnique({
      where: { id: req.params.id },
      include: { quotations: { include: { vendor: true } }, lineItem: true, project: true },
    });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const winner = qr.quotations.find((q) => q.id === quotationId);
    if (!winner) { res.status(400).json({ error: 'Quotation not found' }); return; }

    await prisma.quotation.updateMany({ where: { requestId: qr.id }, data: { isWinner: false } });
    await prisma.quotation.update({ where: { id: quotationId }, data: { isWinner: true } });

    const count = await prisma.purchaseOrder.count();
    const poNumber = `PO-2026-${String(count + 1).padStart(3, '0')}`;
    const amount = winner.amount;

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber, projectId: qr.projectId, vendorId: winner.vendorId,
        title: qr.title, totalAmount: amount, status: POStatus.DRAFT,
        requesterId: req.user!.id, quotationRequestId: qr.id,
        lineItems: {
          create: [{ lineItemId: qr.lineItemId!, description: qr.title, amount }],
        },
      },
      include: { vendor: true, lineItems: true },
    });

    await prisma.quotationRequest.update({
      where: { id: qr.id },
      data: { status: QuotationRequestStatus.PO_CREATED, winnerId: quotationId, winnerReason: reason },
    });

    res.json({ quotationRequest: qr, purchaseOrder: po });
  } catch (err) { next(err); }
});

export default router;