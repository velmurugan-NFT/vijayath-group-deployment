import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { N, sumAmounts } from '../lib/money.js';

const router = Router();

router.get('/receivables', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);

    // Include ALL accessible projects regardless of parent/sub status.
    // Previously this query added `parentId: { not: null }` which silently
    // excluded any top-level project a user was directly assigned to.
    // Now we query everything in the user's scope and let the data speak.
    const projects = await prisma.project.findMany({
      where: { ...pf },
      include: { customerReceipts: true, customerInvoices: true },
    });

    const today = new Date();
    const data = projects
      // Only include projects that have a billable amount set — projects with
      // billable = 0 are either parent containers or not yet configured and
      // would produce meaningless rows in the receivables view.
      .filter((p) => N(p.billable) > 0)
      .map((p) => {
        const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
        const billable = N(p.billable);
        const balance = billable - received;
        const pct = billable > 0 ? Math.round((received / billable) * 100) : 0;

        // Ageing: unmatched balance goes into d90plus as a conservative default;
        // individual invoices are bucketed by their issuedAt date.
        const ageing = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: balance };
        for (const inv of p.customerInvoices) {
          const days = Math.floor((today.getTime() - inv.issuedAt.getTime()) / 86400000);
          const amt = N(inv.amount);
          if (days <= 30)      ageing.d0_30   += amt;
          else if (days <= 60) ageing.d31_60  += amt;
          else if (days <= 90) ageing.d61_90  += amt;
          else                 ageing.d90plus += amt;
        }

        return { projectId: p.id, name: p.name, billable, received, balance, pctCollected: pct, ageing };
      });

    res.json(data);
  } catch (err) { next(err); }
});

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const receipts = await prisma.customerReceipt.findMany({
      where: { project: pf },
      include: {
        project: true,
        invoiceLinks: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(receipts);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, amount, receivedAt, reference, mode, invoiceId, invoiceIds } = req.body as {
      projectId: string;
      amount: number;
      receivedAt: string;
      reference?: string;
      mode?: string;
      invoiceId?: string;
      invoiceIds?: string[];
    };
    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const linkedInvoiceId = invoiceId ?? (Array.isArray(invoiceIds) ? invoiceIds[0] : undefined);
    if (!linkedInvoiceId) {
      res.status(400).json({ error: 'Select an invoice' });
      return;
    }

    const invoice = await prisma.customerInvoice.findFirst({
      where: { id: linkedInvoiceId, projectId },
      include: { receiptLinks: { select: { receiptId: true } } },
    });
    if (!invoice) {
      res.status(400).json({ error: 'Invoice does not belong to this project' });
      return;
    }
    if (invoice.receiptLinks.length > 0) {
      res.status(400).json({ error: 'This invoice already has a receipt recorded' });
      return;
    }
    const invoiceAmount = N(invoice.amount);
    if (N(amount) !== invoiceAmount) {
      res.status(400).json({ error: 'Amount must match the selected invoice amount' });
      return;
    }

    const receipt = await prisma.customerReceipt.create({
      data: {
        projectId,
        amount,
        receivedAt: new Date(receivedAt),
        reference,
        mode: mode?.trim() || null,
        invoiceLinks: { create: [{ invoiceId: linkedInvoiceId }] },
      },
      include: {
        project: true,
        invoiceLinks: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
      },
    });
    await writeAudit(req.user!.id, 'RECEIPT_RECORDED', 'CustomerReceipt', receipt.id, {
      amount, projectId, invoiceId: linkedInvoiceId,
    });
    res.status(201).json(receipt);
  } catch (err) { next(err); }
});

export default router;