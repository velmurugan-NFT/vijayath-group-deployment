import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { QuotationRequestStatus, POStatus } from '../lib/constants.js';
import { N } from '../lib/money.js';

const router = Router();


function unpackQuote(q: Record<string, unknown>) {
  if (typeof q.notes === 'string') {
    try {
      const parsed = JSON.parse(q.notes) as Record<string, unknown>;
      if (parsed._meta) {
        return {
          ...q,
          gstPct:       parsed.gstPct       ?? null,
          paymentTerms: parsed.paymentTerms ?? null,
          notes:        parsed.notes        ?? null,
        };
      }
    } catch { /* plain text note */ }
  }
  return q;
}

// ── GET /quotations  — list all quotation requests in scope ──────────────────
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf        = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items     = await prisma.quotationRequest.findMany({
      where:   { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true, quotations: { include: { vendor: true } }, lineItem: true },
      orderBy: { createdAt: 'desc' },
    });
    const enriched = items.map((item) => ({
      ...item,
      quotations: item.quotations.map((q) => unpackQuote(q as unknown as Record<string, unknown>)),
    }));
    res.json(enriched);
  } catch (err) { next(err); }
});

// ── GET /quotations/:id  — single QR with all quotes (for detail page) ───────
router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const item = await prisma.quotationRequest.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        lineItem: true,
        quotations: {
          include: { vendor: true },
          orderBy: { amount: 'asc' },
        },
      },
    });
    if (!item) { res.status(404).json({ error: 'Not found' }); return; }
    const enriched = {
      ...item,
      quotations: item.quotations.map((q) => unpackQuote(q as unknown as Record<string, unknown>)),
    };
    res.json(enriched);
  } catch (err) { next(err); }
});

// ── POST /quotations  — create a new quotation request ───────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, lineItemId, title, description, quantity, targetDeliveryDate, vendorsInvited } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);
    const qr = await prisma.quotationRequest.create({
      data: {
        projectId,
        lineItemId,
        title,
        description,
        requesterId: req.user!.id,
        status:      QuotationRequestStatus.QUOTES_PENDING,
        // FR-6.1 AC1: extra fields stored in description until schema migration
        ...(quantity || targetDeliveryDate || vendorsInvited
          ? {
              description: JSON.stringify({
                _meta:               true,
                description:         description ?? null,
                quantity:            quantity ?? null,
                targetDeliveryDate:  targetDeliveryDate ?? null,
                vendorsInvited:      vendorsInvited ?? [],
              }),
            }
          : {}),
      },
      include: { project: true, lineItem: true },
    });
    await writeAudit(req.user!.id, 'QUOTATION_REQUEST_CREATED', 'QuotationRequest', qr.id, { title, projectId });
    res.status(201).json(qr);
  } catch (err) { next(err); }
});

// ── PATCH /quotations/:id  — edit title / description of a QR ────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { title, description } = req.body;
    const updated = await prisma.quotationRequest.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined ? { title }       : {}),
        ...(description !== undefined ? { description } : {}),
      },
      include: { project: true, lineItem: true },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── DELETE /quotations/:id  — delete a QR and all its quotes ─────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({
      where:   { id: req.params.id },
      include: { quotations: true },
    });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'delete', ctx ?? undefined);

    // Delete child quotes first (safe even if DB cascades)
    await prisma.quotation.deleteMany({ where: { requestId: qr.id } });
    await prisma.quotationRequest.delete({ where: { id: qr.id } });

    await writeAudit(req.user!.id, 'QUOTATION_REQUEST_DELETED', 'QuotationRequest', qr.id, {
      title:             qr.title,
      quotationsDeleted: qr.quotations.length,
      projectId:         qr.projectId,
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /quotations/:id/quotes  — add a vendor quote to a QR ───────────────
router.post('/:id/quotes', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    // FR-6.1 AC2: unit price, GST%, total, delivery time, payment terms
    const { vendorId, amount, deliveryDays, notes, gstPct, paymentTerms, unitPrice, quantity } = req.body;
    const notesValue: string | undefined =
      (gstPct != null || paymentTerms || unitPrice != null || quantity != null)
        ? JSON.stringify({
            gstPct:       gstPct       ?? null,
            paymentTerms: paymentTerms ?? null,
            unitPrice:    unitPrice    ?? null,
            quantity:     quantity     ?? null,
            _meta:        true,
            notes:        notes        ?? null,
          })
        : (notes ?? undefined);

    const q = await prisma.quotation.create({
      data: { requestId: qr.id, vendorId, amount, deliveryDays, notes: notesValue },
      include: { vendor: true },
    });

    // Move status to COMPARISON once first quote arrives
    await prisma.quotationRequest.update({
      where: { id: qr.id },
      data:  { status: QuotationRequestStatus.COMPARISON },
    });

    await writeAudit(req.user!.id, 'VENDOR_QUOTE_ADDED', 'Quotation', q.id, {
      vendorId, amount, projectId: qr.projectId,
    });

    res.status(201).json(unpackQuote(q as unknown as Record<string, unknown>));
  } catch (err) { next(err); }
});

// ── PATCH /quotations/:id/quotes/:quoteId  — edit a vendor quote ──────────────
router.patch('/:id/quotes/:quoteId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) { res.status(404).json({ error: 'QR not found' }); return; }

    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const existing = await prisma.quotation.findUnique({ where: { id: req.params.quoteId } });
    if (!existing || existing.requestId !== qr.id) {
      res.status(404).json({ error: 'Quote not found in this request' });
      return;
    }

    const { amount, deliveryDays, gstPct, paymentTerms, notes } = req.body;

    // Re-pack extended fields into the notes JSON blob (same pattern as POST)
    const notesValue: string | null | undefined =
      (gstPct != null || paymentTerms != null)
        ? JSON.stringify({
            _meta:        true,
            gstPct:       gstPct        ?? null,
            paymentTerms: paymentTerms  ?? null,
            notes:        notes         ?? null,
          })
        : (notes !== undefined ? (notes ?? null) : undefined);

    const updated = await prisma.quotation.update({
      where: { id: req.params.quoteId },
      data: {
        ...(amount       !== undefined ? { amount }                    : {}),
        ...(deliveryDays !== undefined ? { deliveryDays }              : {}),
        ...(notesValue   !== undefined ? { notes: notesValue }         : {}),
      },
      include: { vendor: true },
    });

    res.json(unpackQuote(updated as unknown as Record<string, unknown>));
  } catch (err) { next(err); }
});

// ── DELETE /quotations/:id/quotes/:quoteId  — remove a vendor quote ───────────
router.delete('/:id/quotes/:quoteId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) { res.status(404).json({ error: 'QR not found' }); return; }

    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const quote = await prisma.quotation.findUnique({ where: { id: req.params.quoteId } });
    if (!quote || quote.requestId !== qr.id) {
      res.status(404).json({ error: 'Quote not found in this request' });
      return;
    }

    await prisma.quotation.delete({ where: { id: req.params.quoteId } });

    // If the deleted quote was the winner, clear winner fields and revert status
    if (quote.isWinner) {
      const remaining = await prisma.quotation.count({ where: { requestId: qr.id } });
      await prisma.quotationRequest.update({
        where: { id: qr.id },
        data: {
          status:       remaining > 0
            ? QuotationRequestStatus.COMPARISON
            : QuotationRequestStatus.QUOTES_PENDING,
          winnerId:     null,
          winnerReason: null,
        },
      });
    } else {
      // If no quotes remain at all, reset to QUOTES_PENDING
      const remaining = await prisma.quotation.count({ where: { requestId: qr.id } });
      if (remaining === 0) {
        await prisma.quotationRequest.update({
          where: { id: qr.id },
          data:  { status: QuotationRequestStatus.QUOTES_PENDING },
        });
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /quotations/:id/select-winner  — pick winner, create PO ─────────────
router.post('/:id/select-winner', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { quotationId, reason } = req.body;
    const qr = await prisma.quotationRequest.findUnique({
      where:   { id: req.params.id },
      include: { quotations: { include: { vendor: true } }, lineItem: true, project: true },
    });
    if (!qr) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const winner = qr.quotations.find((q) => q.id === quotationId);
    if (!winner) { res.status(400).json({ error: 'Quotation not found in this request' }); return; }

    // FR-6.2 AC2: non-lowest-price requires a mandatory reason
    const lowestAmount = Math.min(...qr.quotations.map((q) => N(q.amount)));
    const winnerAmount = N(winner.amount);
    const isLowest     = winnerAmount <= lowestAmount;
    if (!isLowest && (!reason || !reason.trim())) {
      res.status(400).json({
        error:          'A reason is required when selecting a non-lowest-price quote (FR-6.2 AC2)',
        requiresReason: true,
      });
      return;
    }

    // Mark winner / clear others
    await prisma.quotation.updateMany({ where: { requestId: qr.id }, data: { isWinner: false } });
    await prisma.quotation.update({ where: { id: quotationId }, data: { isWinner: true } });

    // Create PO in DRAFT
    const count    = await prisma.purchaseOrder.count();
    const poNumber = `PO-2026-${String(count + 1).padStart(3, '0')}`;
    const amount   = BigInt(Math.round(Number(winner.amount)));

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        projectId:          qr.projectId,
        vendorId:           winner.vendorId,
        title:              qr.title,
        totalAmount:        amount,
        status:             POStatus.DRAFT,
        requesterId:        req.user!.id,
        quotationRequestId: qr.id,
        lineItems: {
          create: [{ lineItemId: qr.lineItemId!, description: qr.title, amount }],
        },
      },
      include: { vendor: true, lineItems: true },
    });

    await prisma.quotationRequest.update({
      where: { id: qr.id },
      data:  { status: QuotationRequestStatus.PO_CREATED, winnerId: quotationId, winnerReason: reason },
    });

    // FR-6.2 AC3: audit-log
    await writeAudit(req.user!.id, 'QUOTE_WINNER_SELECTED', 'QuotationRequest', qr.id, {
      quotationId,
      vendorId:      winner.vendorId,
      amount:        N(winner.amount),
      isLowestPrice: isLowest,
      reason:        reason ?? null,
      poNumber,
      projectId:     qr.projectId,
    });

    res.json({ quotationRequest: { ...qr, status: QuotationRequestStatus.PO_CREATED }, purchaseOrder: po });
  } catch (err) { next(err); }
});

export default router;