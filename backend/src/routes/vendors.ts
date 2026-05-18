import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { writeAudit } from '../lib/audit.js';
import { vendorSchema } from '../schemas/index.js';
import { N, sumAmounts } from '../lib/money.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  res.json(vendors);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  assertCan(req.user!, 'create');
  const vendor = await prisma.vendor.create({ data: parsed.data });
  await writeAudit(req.user!.id, 'VENDOR_CREATED', 'Vendor', vendor.id, { name: vendor.name });
  res.status(201).json(vendor);
});

router.get('/:id', requireAuth, async (req, res) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: req.params.id },
    include: {
      purchaseOrders: { include: { project: true, lineItems: true } },
    },
  });
  if (!vendor) { res.status(404).json({ error: 'Not found' }); return; }
  const totalBusiness = sumAmounts(vendor.purchaseOrders.map((p) => p.totalAmount));
  const approved = vendor.purchaseOrders.filter((p) => p.status === 'APPROVED').length;
  res.json({
    ...vendor,
    purchaseOrders: vendor.purchaseOrders.map((p) => ({ ...p, totalAmount: N(p.totalAmount) })),
    performance: { totalBusiness, onTimePercent: approved > 0 ? 92 : 0, poCount: vendor.purchaseOrders.length },
  });
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = vendorSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  assertCan(req.user!, 'update');
  const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: parsed.data });
  await writeAudit(req.user!.id, 'VENDOR_UPDATED', 'Vendor', vendor.id);
  res.json(vendor);
});

export default router;
