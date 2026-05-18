import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan, can } from '../lib/rbac.js';
import { projectFilter, getProjectContext } from '../lib/scope.js';
import { N, sumAmounts } from '../lib/money.js';
import { writeAudit } from '../lib/audit.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projects = await prisma.project.findMany({
      where: pf,
      include: { sector: true, subProjects: true, parent: true, assignments: { include: { user: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user!, 'read', ctx ?? undefined);
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        sector: true, subProjects: true, parent: true,
        assignments: { include: { user: true } },
        wbsCategories: { include: { lineItems: true }, orderBy: { sortOrder: 'asc' } },
        customerReceipts: true, customerInvoices: true,
      },
    });
    if (!project) { res.status(404).json({ error: 'Not found' }); return; }
    const [tasks, pos, payments, invoices, documents] = await Promise.all([
      prisma.task.count({ where: { projectId: project.id } }),
      prisma.purchaseOrder.count({ where: { projectId: project.id } }),
      prisma.paymentRequest.count({ where: { projectId: project.id } }),
      prisma.customerInvoice.count({ where: { projectId: project.id } }),
      prisma.document.count({ where: { projectId: project.id } }),
    ]);
    const audit = await prisma.auditLog.count({
      where: { entityType: 'Project', entityId: project.id },
    });
    res.json({
      ...project,
      _counts: { tasks, pos, payments, invoices, documents, audit },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/wbs', requireAuth, async (req: AuthRequest, res) => {
  const ctx = await getProjectContext(req.params.id);
  assertCan(req.user!, 'read', ctx ?? undefined);
  const categories = await prisma.wBSCategory.findMany({
    where: { projectId: req.params.id },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  const enriched = await Promise.all(categories.map(async (cat) => ({
    ...cat,
    lineItems: await Promise.all(cat.lineItems.map(async (li) => {
      const pos = await prisma.pOLineItem.findMany({
        where: { lineItemId: li.id, po: { status: 'APPROVED' } },
        include: { po: { include: { vendor: true } } },
      });
      return {
        ...li,
        remaining: N(li.estimated) - N(li.paid),
        variance: N(li.committed) - N(li.estimated),
        contributingPOs: pos.map((p) => ({ poNumber: p.po.poNumber, vendor: p.po.vendor.name, amount: N(p.amount) })),
      };
    })),
    totals: {
      estimated: sumAmounts(cat.lineItems.map((l) => l.estimated)),
      committed: sumAmounts(cat.lineItems.map((l) => l.committed)),
      paid: sumAmounts(cat.lineItems.map((l) => l.paid)),
    },
  })));
  res.json(enriched);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { name, templateId, parentId, sectorId, client, capacityMw, billable, projectHeadId } = req.body;
  assertCan(req.user!, 'create', { sectorId });
  const project = await prisma.project.create({
    data: {
      name, sectorId, parentId: parentId || null, client, capacityMw,
      billable: BigInt(billable ?? 0), netCost: BigInt(0), profit: BigInt(0),
      assignments: projectHeadId ? { create: [{ userId: projectHeadId }] } : undefined,
    },
  });
  if (templateId) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (template) {
      const tasks = JSON.parse(template.tasksJson || '[]') as { title: string; department: string }[];
      for (const t of tasks.slice(0, 5)) {
        await prisma.task.create({
          data: { projectId: project.id, title: t.title, department: t.department, status: 'NOT_STARTED' },
        });
      }
    }
  }
  await writeAudit(req.user!.id, 'PROJECT_CREATED', 'Project', project.id, { name });
  res.status(201).json(project);
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const ctx = await getProjectContext(req.params.id);
  assertCan(req.user!, 'update', ctx ?? undefined);
  const { name, client, status, billable, netCost } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(client && { client }),
      ...(status && { status }),
      ...(billable != null && { billable: BigInt(billable) }),
      ...(netCost != null && { netCost: BigInt(netCost) }),
    },
  });
  res.json(project);
});

export default router;
