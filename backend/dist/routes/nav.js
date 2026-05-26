import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { projectFilter } from '../lib/scope.js';
import { POStatus, PaymentRequestStatus } from '../lib/constants.js';
const router = Router();
router.get('/summary', requireAuth, async (req, res, next) => {
    try {
        const pf = await projectFilter(req.user);
        const scope = Object.keys(pf).length > 0 ? { project: pf } : {};
        const [pendingPOs, pendingPayments, delayedTasks] = await Promise.all([
            prisma.purchaseOrder.count({ where: { status: POStatus.PENDING_APPROVAL, ...scope } }),
            prisma.paymentRequest.count({ where: { status: PaymentRequestStatus.PENDING_APPROVAL, ...scope } }),
            prisma.task.count({ where: { isDelayed: true, ...scope } }),
        ]);
        res.json({
            pendingApprovals: pendingPOs + pendingPayments,
            delayedTasks,
        });
    }
    catch (err) {
        next(err);
    }
});
export default router;
