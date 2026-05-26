import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { projectFilter } from '../lib/scope.js';
import { POStatus, PaymentRequestStatus } from '../lib/constants.js';
import { N } from '../lib/money.js';
import { projectIdFromQuery } from '../lib/query.js';
const router = Router();
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const pf = await projectFilter(req.user);
        const projectId = projectIdFromQuery(req.query);
        const projectWhere = projectId ? { ...pf, id: projectId } : pf;
        const pendingPOs = await prisma.purchaseOrder.findMany({
            where: { status: POStatus.PENDING_APPROVAL, project: projectWhere },
            include: {
                vendor: true, project: true, requester: true,
                lineItems: { include: { lineItem: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const pendingPayments = await prisma.paymentRequest.findMany({
            where: { status: PaymentRequestStatus.PENDING_APPROVAL, project: projectWhere },
            include: { po: { include: { vendor: true } }, project: true, requester: true },
            orderBy: { createdAt: 'desc' },
        });
        const poEnriched = await Promise.all(pendingPOs.map(async (po) => {
            const budgetImpact = await Promise.all(po.lineItems.map(async (li) => {
                const line = await prisma.wBSLineItem.findUnique({ where: { id: li.lineItemId } });
                const committed = N(line?.committed);
                const estimated = N(line?.estimated);
                const liAmount = N(li.amount);
                // PO is PENDING_APPROVAL — not yet approved, so committed does NOT include
                // this PO's amount yet. Add liAmount to get the true newCommitted.
                const newCommitted = committed + liAmount;
                return {
                    lineItemId: li.lineItemId,
                    description: li.description,
                    currentCommitted: committed,
                    newCommitted,
                    estimated,
                    breach: newCommitted > estimated,
                };
            }));
            return { type: 'PO', id: po.id, poNumber: po.poNumber, amount: N(po.totalAmount), project: po.project, vendor: po.vendor, requester: po.requester, budgetImpact };
        }));
        const paymentEnriched = pendingPayments.map((pr) => ({
            type: 'PAYMENT',
            id: pr.id,
            amount: N(pr.amount),
            project: pr.project,
            po: pr.po,
            requester: pr.requester,
            purpose: pr.purpose,
        }));
        res.json({ items: [...poEnriched, ...paymentEnriched] });
    }
    catch (err) {
        next(err);
    }
});
export default router;
