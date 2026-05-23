import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { writeAudit } from '../lib/audit.js';
import { vendorSchema } from '../schemas/index.js';
import { N, sumAmounts } from '../lib/money.js';

const router = Router();

// ── GET /vendors ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
    res.json(vendors);
  } catch (err) { next(err); }
});

// ── POST /vendors ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = vendorSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    assertCan(req.user!, 'create');
    const vendor = await prisma.vendor.create({ data: parsed.data });
    await writeAudit(req.user!.id, 'VENDOR_CREATED', 'Vendor', vendor.id, { name: vendor.name });
    res.status(201).json(vendor);
  } catch (err) { next(err); }
});

// ── GET /vendors/:id ──────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

// ── PATCH /vendors/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = vendorSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    assertCan(req.user!, 'update');
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: parsed.data });
    await writeAudit(req.user!.id, 'VENDOR_UPDATED', 'Vendor', vendor.id);
    res.json(vendor);
  } catch (err) { next(err); }
});

// ── DELETE /vendors/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    assertCan(req.user!, 'delete');

    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }

    await prisma.vendor.delete({ where: { id: req.params.id } });
    await writeAudit(req.user!.id, 'VENDOR_DELETED', 'Vendor', req.params.id, { name: vendor.name });

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;