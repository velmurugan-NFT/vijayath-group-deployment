// routes/vendor-invoices.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { POStatus } from '../lib/constants.js';

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

async function nextInvoiceNumber(): Promise<string> {
  const prefix = `VI-${new Date().toISOString().slice(0, 7).replace('-', '')}-`;
  const last = await prisma.vendorInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
  });
  const seq = last
    ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const includeAll = {
  po: {
    include: {
      vendor: true,
      project: true,
      vendorInvoices: { select: { id: true, amount: true } },
    },
  },
  payments: { orderBy: { paidAt: 'asc' as const } },
};

/**
 * Compute how much has actually been paid for a PO via PaymentRequest → Payment.
 * This is the real payment trail — VendorInvoicePayment is a separate sub-system.
 *
 * Schema path: PaymentRequest.poId + PaymentRequest.payment (Payment.amount)
 * A PaymentRequest is "paid" when it has a Payment record (execute step sets this).
 */
async function getPaidAmountForPo(poId: string): Promise<number> {
  const paidRequests = await prisma.paymentRequest.findMany({
    where: {
      poId,
      payment: { isNot: null },   // has a Payment record = executed/paid
    },
    include: { payment: true },
  });
  return paidRequests.reduce((sum, pr) => sum + Number(pr.payment!.amount), 0);
}

/**
 * Attach paidAmount and isPaid to each invoice.
 * paidAmount = total paid via PaymentRequest → Payment for that PO.
 * isPaid     = paidAmount >= invoice.amount
 */
async function attachPaidAmounts(invoices: Awaited<ReturnType<typeof fetchInvoices>>) {
  return Promise.all(
    invoices.map(async (inv) => {
      const paidAmount = await getPaidAmountForPo(inv.poId);
      return {
        ...inv,
        paidAmount,
        isPaid: paidAmount >= Number(inv.amount),
      };
    }),
  );
}

async function fetchInvoices(where: object) {
  return prisma.vendorInvoice.findMany({
    where,
    include: includeAll,
    orderBy: { createdAt: 'desc' },
  });
}

// ── LIST ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;

    const raw = await fetchInvoices({
      po: { project: projectId ? { ...pf, id: projectId } : pf },
    });

    // Attach paidAmount + isPaid computed from PaymentRequest → Payment
    const items = await attachPaidAmounts(raw);

    res.json(items);
  } catch (err) { next(err); }
});

// ── CREATE (or update existing invoice for the same PO) ───────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, amount, invoiceDate, invoiceNumber: customNumber } = req.body;

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) { res.status(400).json({ error: 'PO not found' }); return; }
    if (po.status !== POStatus.APPROVED && po.status !== POStatus.SENT_TO_VENDOR) {
      res.status(400).json({ error: 'Only approved POs can be invoiced' });
      return;
    }

    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const newAmount = amount ?? Number(po.totalAmount);

    const existing = await prisma.vendorInvoice.findFirst({
      where: { poId },
      include: includeAll,
    });

    if (existing) {
      const updatedAmount = Number(existing.amount) + Number(newAmount);
      if (updatedAmount > Number(po.totalAmount)) {
        res.status(400).json({
          error: `Total invoiced (₹${updatedAmount}) would exceed PO total (₹${po.totalAmount})`,
        });
        return;
      }
      const updated = await prisma.vendorInvoice.update({
        where: { id: existing.id },
        data: {
          amount: updatedAmount,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : existing.invoiceDate,
        },
        include: includeAll,
      });
      const paidAmount = await getPaidAmountForPo(poId);
      return res.status(200).json({
        ...updated,
        paidAmount,
        isPaid: paidAmount >= updatedAmount,
        _merged: true,
      });
    }

    const invoiceNumber = customNumber?.trim() || (await nextInvoiceNumber());
    const inv = await prisma.vendorInvoice.create({
      data: {
        poId,
        invoiceNumber,
        amount: newAmount,
        invoiceDate: new Date(invoiceDate ?? Date.now()),
      },
      include: includeAll,
    });
    const paidAmount = await getPaidAmountForPo(poId);
    res.status(201).json({ ...inv, paidAmount, isPaid: paidAmount >= newAmount });
  } catch (err) { next(err); }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────

router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const inv = await prisma.vendorInvoice.findUnique({
      where: { id: req.params.id },
      include: { po: true, payments: true },
    });
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const ctx = await getProjectContext(inv.po.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { amount, invoiceDate } = req.body;

    if (amount !== undefined) {
      const paid = await getPaidAmountForPo(inv.poId);
      if (amount < paid) {
        res.status(400).json({
          error: `Cannot reduce amount below already-paid total (₹${paid})`,
        });
        return;
      }
    }

    const updated = await prisma.vendorInvoice.update({
      where: { id: req.params.id },
      data: {
        ...(amount      !== undefined && { amount }),
        ...(invoiceDate !== undefined && { invoiceDate: new Date(invoiceDate) }),
      },
      include: includeAll,
    });
    const paidAmount = await getPaidAmountForPo(inv.poId);
    res.json({ ...updated, paidAmount, isPaid: paidAmount >= Number(updated.amount) });
  } catch (err) { next(err); }
});

// ── RECORD A PAYMENT (VendorInvoicePayment sub-system) ────────────────────────

router.post('/:id/payments', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const inv = await prisma.vendorInvoice.findUnique({
      where: { id: req.params.id },
      include: { po: true, payments: true },
    });
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const ctx = await getProjectContext(inv.po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const paid    = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = inv.amount - paid;
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Payment amount must be positive' });
      return;
    }
    if (amount > balance) {
      res.status(400).json({ error: `Payment (₹${amount}) exceeds balance (₹${balance})` });
      return;
    }

    const payment = await prisma.vendorInvoicePayment.create({
      data: { invoiceId: inv.id, amount, note },
    });
    const updated = await prisma.vendorInvoice.findUnique({
      where: { id: inv.id },
      include: includeAll,
    });
    res.status(201).json({ payment, invoice: updated });
  } catch (err) { next(err); }
});

export default router;
