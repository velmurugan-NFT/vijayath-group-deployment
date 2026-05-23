import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items = await prisma.vendorInvoice.findMany({
      where: {
        po: {
          project: projectId ? { ...pf, id: projectId } : pf,
        },
      },
      include: { po: { include: { vendor: true, project: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, invoiceNumber, amount, invoiceDate } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) {
      res.status(400).json({ error: 'PO not found' });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);
    const inv = await prisma.vendorInvoice.create({
      data: { poId, invoiceNumber, amount, invoiceDate: new Date(invoiceDate) },
      include: { po: { include: { vendor: true, project: true } } },
    });
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

export default router;