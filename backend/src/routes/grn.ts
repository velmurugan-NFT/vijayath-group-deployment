import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext } from '../lib/scope.js';
import { POStatus } from '../lib/constants.js';

const router = Router();

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const grns = await prisma.gRN.findMany({
      include: { po: { include: { vendor: true, project: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(grns);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, grnNumber, receivedAt, notes } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: 'PO must be approved' });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);
    const grn = await prisma.gRN.create({
      data: { poId, grnNumber, receivedAt: new Date(receivedAt), notes },
      include: { po: { include: { vendor: true } } },
    });
    res.status(201).json(grn);
  } catch (err) { next(err); }
});

export default router;