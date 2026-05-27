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

/**
 * Compute budget impact for a set of PO line items.
 *
 * KEY RULE — how `committed` relates to this PO:
 *
 *  • PENDING_APPROVAL / DRAFT / RETURNED:
 *      This PO has NOT been approved yet, so recalcLineItem has never counted it.
 *      committed (DB) does NOT include li.amount  →  add li.amount to get newCommitted.
 *
 *  • APPROVED / SENT_TO_VENDOR:
 *      recalcLineItem ran after approval and already baked li.amount into committed.
 *      committed (DB) ALREADY includes li.amount  →  newCommitted = committed (no double-add).
 *
 * Without this distinction every approved PO shows a false breach because
 * the formula counted: committed(already includes 2L) + li.amount(2L) = 4L > estimated(3L).
 */
async function buildBudgetImpact(
  lineItems: { lineItemId: string; description: string; amount: bigint | number }[],
  poStatus: string,
) {
  const alreadyCounted =
    poStatus === POStatus.APPROVED ||
    poStatus === POStatus.SENT_TO_VENDOR;

  return Promise.all(lineItems.map(async (li) => {
    const line = await prisma.wBSLineItem.findUnique({ where: { id: li.lineItemId } });
    const committed  = N(line?.committed);
    const estimated  = N(line?.estimated);
    const liAmount   = N(li.amount);

    // If this PO is already approved, committed already includes liAmount — don't add again.
    const newCommitted = alreadyCounted ? committed : committed + liAmount;

    return {
      lineItemId:       li.lineItemId,
      description:      li.description,
      currentCommitted: committed,
      newCommitted,
      estimated,
      breach: newCommitted > estimated,
    };
  }));
}

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const pos = await prisma.purchaseOrder.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(pos);
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } },
    });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'read', ctx ?? undefined);

    const budgetImpact = await buildBudgetImpact(po.lineItems, po.status);

    // FR-6.5: include version history
    const versions = await (prisma as any).pOVersion?.findMany?.({
      where: { purchaseOrderId: po.id },
      orderBy: { version: 'desc' },
    }).catch(() => []) ?? [];

    res.json({ ...po, budgetImpact, versions });
  } catch (err) { next(err); }
});

// FR-6.3 AC2: edit a DRAFT PO before submission
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    if (po.status !== POStatus.DRAFT && po.status !== POStatus.RETURNED) {
      res.status(400).json({ error: `Cannot edit a PO in status ${po.status}` }); return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { title, totalAmount, deliveryDate, paymentTerms } = req.body;
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        ...(title        && { title }),
        ...(totalAmount  != null && { totalAmount: BigInt(totalAmount) }),
        ...(deliveryDate && { deliveryDate: new Date(deliveryDate) }),
        ...(paymentTerms && { paymentTerms }),
        status: POStatus.DRAFT,
      },
      include: { vendor: true, lineItems: true },
    });
    await writeAudit(req.user!.id, 'PO_EDITED', 'PurchaseOrder', po.id, { poNumber: po.poNumber, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/submit', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.PENDING_APPROVAL },
      include: { vendor: true, lineItems: true },
    });
    await writeAudit(req.user!.id, 'PO_SUBMITTED', 'PurchaseOrder', po.id, { poNumber: po.poNumber, amount: po.totalAmount, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { acknowledgeBreach } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { lineItems: true } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'approve', ctx ?? undefined);

    blockSelfApproval(req.user!.id, po.requesterId);
    const poAmount = N(po.totalAmount);
    blockMakerChecker(req.user!.id, po.requesterId);

    if (!canRoleApprove(req.user!.role as Role, poAmount)) {
      res.status(403).json({ error: 'Your role cannot approve this amount' }); return;
    }

    // PO is still PENDING_APPROVAL here — committed does NOT yet include this PO's amount.
    // Use buildBudgetImpact with PENDING_APPROVAL so it adds li.amount correctly.
    const impact = await buildBudgetImpact(po.lineItems, POStatus.PENDING_APPROVAL);
    const hasBreach = impact.some((b) => b.breach);
    if (hasBreach && !acknowledgeBreach) {
      res.status(400).json({ error: 'Budget breach acknowledgment required', budgetBreach: true }); return;
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.APPROVED, approverId: req.user!.id, approvedAt: new Date() },
      include: { vendor: true, lineItems: true },
    });

    for (const li of po.lineItems) await recalcLineItem(li.lineItemId);
    await writeAudit(req.user!.id, 'PO_APPROVED', 'PurchaseOrder', po.id, { poNumber: po.poNumber, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) { res.status(400).json({ error: 'Rejection reason is required' }); return; }
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    blockSelfApproval(req.user!.id, po.requesterId);
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.REJECTED, rejectReason: reason },
    });
    await writeAudit(req.user!.id, 'PO_REJECTED', 'PurchaseOrder', po.id, { reason, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

// FR-6.4 AC2: return for edit
router.post('/:id/return', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { reason } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.RETURNED, rejectReason: reason ?? 'Returned for edit' },
    });
    await writeAudit(req.user!.id, 'PO_RETURNED', 'PurchaseOrder', po.id, { reason, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

// FR-6.4 AC3: mark sent to vendor — only APPROVED POs
router.post('/:id/send', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }
    if (po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: 'Only approved POs can be sent to vendor (FR-6.4 AC3)' }); return;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.SENT_TO_VENDOR },
    });
    await writeAudit(req.user!.id, 'PO_SENT_TO_VENDOR', 'PurchaseOrder', po.id, { poNumber: po.poNumber, projectId: po.projectId });
    res.json(updated);
  } catch (err) { next(err); }
});

// FR-6.5: Amend an APPROVED PO — creates a new version snapshot, resets to DRAFT for re-approval
router.post('/:id/amend', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { lineItems: true },
    });
    if (!po) { res.status(404).json({ error: 'Not found' }); return; }

    // Only APPROVED or SENT_TO_VENDOR POs can be amended
    if (po.status !== POStatus.APPROVED && po.status !== POStatus.SENT_TO_VENDOR) {
      res.status(400).json({ error: 'Only approved POs can be amended (FR-6.5)' }); return;
    }

    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { title, totalAmount, deliveryDate, paymentTerms, amendReason } = req.body;
    if (!amendReason?.trim()) {
      res.status(400).json({ error: 'Amendment reason is required (FR-6.5)' }); return;
    }

    const currentVersion: number = (po as any).version ?? 1;

    // FR-6.5 AC1: snapshot current version into POVersion table (best-effort — table may not exist yet)
    try {
      await (prisma as any).pOVersion.create({
        data: {
          purchaseOrderId: po.id,
          version: currentVersion,
          poNumber: (po as any).poNumber,
          title: po.title,
          totalAmount: po.totalAmount,
          deliveryDate: (po as any).deliveryDate,
          paymentTerms: (po as any).paymentTerms,
          status: po.status,
          amendReason,
          snapshotAt: new Date(),
          snapshotById: req.user!.id,
        },
      });
    } catch {
      // POVersion table not yet migrated — log to audit instead
      await writeAudit(req.user!.id, 'PO_VERSION_SNAPSHOT', 'PurchaseOrder', po.id, {
        version: currentVersion,
        amendReason,
        prevStatus: po.status,
        prevAmount: po.totalAmount?.toString(),
      });
    }

    const amountChanged = totalAmount != null && BigInt(totalAmount) !== BigInt(po.totalAmount ?? 0);

    // Apply amendments and move back to DRAFT (re-approval required if amount changes, FR-6.5 AC2)
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        ...(title        && { title }),
        ...(totalAmount  != null && { totalAmount: BigInt(totalAmount) }),
        ...(deliveryDate && { deliveryDate: new Date(deliveryDate) }),
        ...(paymentTerms && { paymentTerms }),
        // FR-6.5 AC2: if amount changes, requires re-approval
        status: amountChanged ? POStatus.DRAFT : POStatus.APPROVED,
        // Bump version counter
        version: currentVersion + 1,
      } as any,
      include: { vendor: true, lineItems: true },
    });

    await writeAudit(req.user!.id, 'PO_AMENDED', 'PurchaseOrder', po.id, {
      poNumber: (po as any).poNumber,
      newVersion: currentVersion + 1,
      amendReason,
      amountChanged,
      projectId: po.projectId,
    });

    res.json({ ...updated, requiresReapproval: amountChanged });
  } catch (err) { next(err); }
});

export default router;