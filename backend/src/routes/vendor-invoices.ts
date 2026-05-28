// routes/vendor-invoices.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { POStatus } from '../lib/constants.js'; 

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Auto-generate next invoice number: VI-YYYYMM-NNNN */
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
  po: { include: { vendor: true, project: true } },
  payments: { orderBy: { paidAt: 'asc' as const } },
};

// ── LIST ─────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items = await prisma.vendorInvoice.findMany({
      where: {
        po: { project: projectId ? { ...pf, id: projectId } : pf },
      },
      include: includeAll,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) { next(err); }
});

// ── CREATE ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { poId, amount, invoiceDate } = req.body;

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) { res.status(400).json({ error: 'PO not found' }); return; }
    // ✅ correct — APPROVED or SENT_TO_VENDOR can be invoiced
if (po.status !== POStatus.APPROVED && po.status !== POStatus.SENT_TO_VENDOR) {
  res.status(400).json({ error: 'Only approved POs can be invoiced' });
  return;
}
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const invoiceNumber = await nextInvoiceNumber();

  // Replace the create block:
const inv = await prisma.vendorInvoice.create({
  data: {
    poId,
    invoiceNumber,
    amount: amount ?? Number(po.totalAmount),  // fallback to PO total
    invoiceDate: new Date(invoiceDate ?? Date.now()),
  },
  include: includeAll,
});
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

// ── UPDATE (edit invoice details) ────────────────────────────────────────────

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

    // Guard: new amount must not be less than what's already been paid
    if (amount !== undefined) {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
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
    res.json(updated);
  } catch (err) { next(err); }
});

// ── RECORD A PAYMENT ──────────────────────────────────────────────────────────

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
      res.status(400).json({
        error: `Payment (₹${amount}) exceeds balance (₹${balance})`,
      });
      return;
    }

    const payment = await prisma.vendorInvoicePayment.create({
      data: { invoiceId: inv.id, amount, note },
    });

    // Return the full updated invoice so the UI can refresh in one round-trip
    const updated = await prisma.vendorInvoice.findUnique({
      where: { id: inv.id },
      include: includeAll,
    });
    res.status(201).json({ payment, invoice: updated });
  } catch (err) { next(err); }
});

export default router;