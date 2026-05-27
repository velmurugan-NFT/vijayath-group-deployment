import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { POStatus } from '../lib/constants.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const grns = await prisma.gRN.findMany({
      where: { po: { project: pf } },
      include: { po: { include: { vendor: true, project: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(grns);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, grnNumber, receivedAt, notes, qualityPass, qualityRemark, quantityReceived } = req.body;

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: 'PO must be approved before recording a GRN (FR-6.6)' }); return;
    }

    // FR-6.6 AC2: quality fail requires a remark
    if (qualityPass === false && (!qualityRemark || !qualityRemark.trim())) {
      res.status(400).json({ error: 'Quality fail requires a remark (FR-6.6 AC2)' }); return;
    }

    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const grn = await prisma.gRN.create({
      data: {
        poId,
        grnNumber,
        receivedAt: new Date(receivedAt),
        notes,
        // FR-6.6 AC2: quality check fields
        ...(qualityPass !== undefined && { qualityPass }),
        ...(qualityRemark !== undefined && { qualityRemark }),
        // FR-6.6 AC1: partial receipt — how much was received this GRN
       ...(quantityReceived !== undefined && { quantityReceived }),
       ...(req.user!.id && { recordedById: req.user!.id }),
      },
      include: { po: { include: { vendor: true, project: true } } },
    });

    await writeAudit(req.user!.id, 'GRN_RECORDED', 'GRN', grn.id, {
      poId,
      grnNumber,
      qualityPass: (grn as any).qualityPass,
      qualityRemark: (grn as any).qualityRemark,
      quantityReceived: (grn as any).quantityReceived,
      projectId: po.projectId,
    });

    res.status(201).json(grn);
  } catch (err) { next(err); }
});

export default router;