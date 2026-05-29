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
 * Compute how much has been paid for a SPECIFIC INVOICE
 * via PaymentRequest → Payment, filtered by vendorInvoiceId.
 */
async function getPaidAmountForInvoice(invoiceId: string): Promise<number> {
  const invoicePayments = await prisma.paymentRequest.findMany({
    where: {
      vendorInvoiceId: invoiceId,
      payment: { isNot: null },
    },
    include: { payment: true },
  });
  return invoicePayments.reduce((sum, pr) => sum + Number(pr.payment!.amount), 0);
}

/**
 * Attach paidAmount and isPaid to each invoice using per-invoice payment lookup.
 */
async function attachPaidAmounts(invoices: Awaited<ReturnType<typeof fetchInvoices>>) {
  return Promise.all(
    invoices.map(async (inv) => {
      const paidAmount = await getPaidAmountForInvoice(inv.id);
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

    const items = await attachPaidAmounts(raw);
    res.json(items);
  } catch (err) { next(err); }
});

// ── CREATE ────────────────────────────────────────────────────────────────────

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

    const newAmount = Number(amount ?? po.totalAmount);

    // Guard: new invoice must not exceed remaining PO balance
    const existingInvoices = await prisma.vendorInvoice.findMany({
      where: { poId },
      select: { amount: true },
    });
    const alreadyInvoiced = existingInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount), 0
    );
    const remainingBalance = Number(po.totalAmount) - alreadyInvoiced;

    if (newAmount > remainingBalance) {
      res.status(400).json({
        error: `Invoice amount (₹${newAmount}) exceeds remaining PO balance (₹${remainingBalance})`,
      });
      return;
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

    res.status(201).json({ ...inv, paidAmount: 0, isPaid: false });
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
      // Must not go below what's already paid for this invoice
      const paid = await getPaidAmountForInvoice(inv.id);
      if (amount < paid) {
        res.status(400).json({
          error: `Cannot reduce amount below already-paid total (₹${paid})`,
        });
        return;
      }

      // Must not exceed remaining PO balance (excluding this invoice)
      const otherInvoices = await prisma.vendorInvoice.findMany({
        where: { poId: inv.poId, id: { not: inv.id } },
        select: { amount: true },
      });
      const otherInvoiced = otherInvoices.reduce(
        (sum, i) => sum + Number(i.amount), 0
      );
      const maxAllowed = Number(inv.po.totalAmount) - otherInvoiced;
      if (amount > maxAllowed) {
        res.status(400).json({
          error: `Amount exceeds remaining PO balance (₹${maxAllowed})`,
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
    const paidAmount = await getPaidAmountForInvoice(inv.id);
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
