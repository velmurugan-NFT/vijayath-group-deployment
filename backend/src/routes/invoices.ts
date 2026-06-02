import { Router } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { InvoiceType, InvoiceStatus } from '../lib/constants.js';
import { N } from '../lib/money.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const availableForReceipt = req.query.availableForReceipt === 'true';
    const invoices = await prisma.customerInvoice.findMany({
      where: {
        project: projectId ? { ...pf, id: projectId } : pf,
        ...(availableForReceipt && { receiptLinks: { none: {} } }),
      },
      include: {
        project: true,
        _count: { select: { receiptLinks: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
    res.json(invoices);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, type, amount, milestone, taxAmount } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const count = await prisma.customerInvoice.count();
    const prefix = type === InvoiceType.TAX ? 'INV-TX' : 'INV-PF';
    const invoiceNumber = `${prefix}-2026-${String(count + 1).padStart(3, '0')}`;

    const invoice = await prisma.customerInvoice.create({
      data: {
        projectId, type: type ?? InvoiceType.PROFORMA, amount, taxAmount: taxAmount ?? 0,
        milestone, invoiceNumber, status: InvoiceStatus.ISSUED, issuedAt: new Date(),
      },
      include: { project: true },
    });
    await writeAudit(req.user!.id, 'INVOICE_GENERATED', 'CustomerInvoice', invoice.id, { invoiceNumber, amount, projectId });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    if (!existing) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { type, amount, milestone, taxAmount } = req.body;
    const invoice = await prisma.customerInvoice.update({
      where: { id: req.params.id },
      data: {
        ...(type != null && { type }),
        ...(amount != null && { amount }),
        ...(milestone !== undefined && { milestone: milestone || null }),
        ...(taxAmount != null && { taxAmount }),
      },
      include: { project: true },
    });
    await writeAudit(req.user!.id, 'INVOICE_UPDATED', 'CustomerInvoice', invoice.id, {
      invoiceNumber: invoice.invoiceNumber,
      amount: N(invoice.amount),
    });
    res.json(invoice);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { receiptLinks: true },
    });
    if (!existing) { res.status(404).json({ error: 'Invoice not found' }); return; }

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'delete', ctx ?? undefined);

    if (existing.receiptLinks.length > 0) {
      res.status(400).json({ error: 'Cannot delete an invoice that has a receipt linked to it' });
      return;
    }

    await prisma.customerInvoice.delete({ where: { id: req.params.id } });
    await writeAudit(req.user!.id, 'INVOICE_DELETED', 'CustomerInvoice', existing.id, {
      invoiceNumber: existing.invoiceNumber,
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/:id/pdf', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { parent: true } } },
    });
    if (!invoice) { res.status(404).json({ error: 'Not found' }); return; }

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const fmt = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;
    let y = 780;
    page.drawText('VIJAYANTH RENEWABLE ENERGY PROJECTS', { x: 50, y, size: 14, font: bold, color: rgb(0.075, 0.243, 0.133) });
    y -= 30;
    page.drawText(`${invoice.type} INVOICE`, { x: 50, y, size: 18, font: bold });
    y -= 25;
    page.drawText(`Invoice No: ${invoice.invoiceNumber}`, { x: 50, y, size: 11, font });
    y -= 18;
    page.drawText(`Date: ${invoice.issuedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, { x: 50, y, size: 11, font });
    y -= 30;
    page.drawText(`Project: ${invoice.project.name}`, { x: 50, y, size: 11, font });
    y -= 18;
    page.drawText(`Client: ${invoice.project.client ?? 'VCPPL'}`, { x: 50, y, size: 11, font });
    y -= 18;
    if (invoice.milestone) { page.drawText(`Milestone: ${invoice.milestone}`, { x: 50, y, size: 11, font }); y -= 18; }
    y -= 20;
    page.drawText(`Amount: ${fmt(N(invoice.amount))}`, { x: 50, y, size: 14, font: bold });
    if (N(invoice.taxAmount)) {
      y -= 18;
      page.drawText(`Tax: ${fmt(N(invoice.taxAmount))}`, { x: 50, y, size: 11, font });
      y -= 18;
      page.drawText(`Total: ${fmt(N(invoice.amount) + N(invoice.taxAmount))}`, { x: 50, y, size: 12, font: bold });
    }

    const bytes = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) { next(err); }
});

export default router;