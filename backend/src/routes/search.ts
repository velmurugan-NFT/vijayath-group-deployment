import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { projectFilter } from '../lib/scope.js';

const router = Router();

const TAKE = 5;

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }

    const pf = await projectFilter(req.user!);
    const projectWhere = { project: pf };
    const textFilter = (fields: string[]) =>
      fields.map((field) => ({ [field]: { contains: q } }));

    const [projects, vendors, pos, quotations, invoices] = await Promise.all([
      prisma.project.findMany({
        where: {
          ...pf,
          OR: textFilter(['name', 'code', 'client']),
        },
        take: TAKE,
        select: { id: true, name: true, code: true, client: true },
        orderBy: { name: 'asc' },
      }),
      prisma.vendor.findMany({
        where: { OR: textFilter(['name', 'gstin', 'category']) },
        take: TAKE,
        select: { id: true, name: true, category: true },
        orderBy: { name: 'asc' },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          ...projectWhere,
          OR: textFilter(['poNumber', 'title']),
        },
        take: TAKE,
        select: {
          id: true,
          poNumber: true,
          title: true,
          project: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quotationRequest.findMany({
        where: {
          ...projectWhere,
          OR: textFilter(['title', 'description']),
        },
        take: TAKE,
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customerInvoice.findMany({
        where: {
          ...projectWhere,
          OR: textFilter(['invoiceNumber', 'milestone']),
        },
        take: TAKE,
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          project: { select: { name: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const results = [
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: p.name,
        subtitle: [p.code, p.client].filter(Boolean).join(' · ') || undefined,
      })),
      ...vendors.map((v) => ({
        type: 'vendor' as const,
        id: v.id,
        title: v.name,
        subtitle: v.category,
      })),
      ...pos.map((po) => ({
        type: 'po' as const,
        id: po.id,
        title: po.poNumber,
        subtitle: [po.title, po.project.name].filter(Boolean).join(' · '),
      })),
      ...quotations.map((qr) => ({
        type: 'quotation' as const,
        id: qr.id,
        title: qr.title,
        subtitle: [qr.project.name, qr.status].filter(Boolean).join(' · '),
      })),
      ...invoices.map((inv) => ({
        type: 'invoice' as const,
        id: inv.id,
        title: inv.invoiceNumber,
        subtitle: [inv.type, inv.project.name].filter(Boolean).join(' · '),
      })),
    ];

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
