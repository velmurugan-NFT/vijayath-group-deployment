import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { projectFilter, getProjectContext } from '../lib/scope.js';
import { N, sumAmounts } from '../lib/money.js';
import { writeAudit } from '../lib/audit.js';
const router = Router();
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const pf = await projectFilter(req.user);
        const projects = await prisma.project.findMany({
            where: pf,
            include: { sector: true, subProjects: true, parent: true, assignments: { include: { user: true } } },
            orderBy: { name: 'asc' },
        });
        const userId = req.user.id;
        const role = req.user.role;
        const scoped = role === 'PROJECT_HEAD'
            ? projects.filter((p) => p.assignments.some((a) => a.userId === userId))
            : projects;
        res.json(scoped);
    }
    catch (err) {
        next(err);
    }
});
router.get('/eligible-heads', requireAuth, async (req, res, next) => {
    try {
        const heads = await prisma.user.findMany({
            where: { role: 'PROJECT_HEAD' },
            select: { id: true, name: true, role: true, email: true },
            orderBy: { name: 'asc' },
        });
        res.json(heads);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'read', ctx ?? undefined);
        const project = await prisma.project.findUnique({
            where: { id: req.params.id },
            include: {
                sector: true, subProjects: true, parent: true,
                assignments: { include: { user: true } },
                wbsCategories: { include: { lineItems: true }, orderBy: { sortOrder: 'asc' } },
                customerReceipts: true, customerInvoices: true,
            },
        });
        if (!project) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
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
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/wbs', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'read', ctx ?? undefined);
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
    }
    catch (err) {
        next(err);
    }
});
// Add a single line item to an existing or new category
router.post('/:id/wbs/line-items', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'create', ctx ?? undefined);
        const { categoryName, description, estimated } = req.body;
        if (!categoryName || !description) {
            res.status(400).json({ error: 'categoryName and description are required' });
            return;
        }
        // Find or create category
        let cat = await prisma.wBSCategory.findFirst({
            where: { projectId: req.params.id, name: categoryName },
        });
        if (!cat) {
            const count = await prisma.wBSCategory.count({ where: { projectId: req.params.id } });
            cat = await prisma.wBSCategory.create({
                data: { projectId: req.params.id, name: categoryName, sortOrder: count },
            });
        }
        const count = await prisma.wBSLineItem.count({ where: { categoryId: cat.id } });
        const li = await prisma.wBSLineItem.create({
            data: {
                projectId: req.params.id, categoryId: cat.id,
                description, estimated: BigInt(estimated ?? 0),
                committed: BigInt(0), paid: BigInt(0), sortOrder: count,
            },
        });
        res.status(201).json({ ...li, categoryName: cat.name });
    }
    catch (err) {
        next(err);
    }
});
// PATCH estimated amount on a WBS line item
router.patch('/:id/wbs/line-items/:lineItemId', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'update', ctx ?? undefined);
        const { estimated } = req.body;
        if (estimated == null || isNaN(Number(estimated))) {
            res.status(400).json({ error: 'estimated is required and must be a number' });
            return;
        }
        const li = await prisma.wBSLineItem.update({
            where: { id: req.params.lineItemId },
            data: { estimated: BigInt(Math.round(Number(estimated))) },
        });
        res.json({ ...li, estimated: Number(li.estimated) });
    }
    catch (err) {
        next(err);
    }
});
// Seed default Solar EPC WBS for a project that has none
router.post('/:id/wbs/seed-defaults', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'create', ctx ?? undefined);
        const existing = await prisma.wBSCategory.count({ where: { projectId: req.params.id } });
        if (existing > 0) {
            res.status(400).json({ error: 'Project already has WBS items' });
            return;
        }
        const defaults = [
            { cat: 'Land', desc: 'Land acquisition / lease' },
            { cat: '33KV Transmission Line', desc: '33KV transmission line works' },
            { cat: 'Substation Work', desc: 'Substation civil & equipment' },
            { cat: 'Yard & Civil', desc: 'Yard grading, roads & civil foundation' },
            { cat: 'Yard Products', desc: 'Transformer, HT Breaker, LT Panel, Inverter' },
            { cat: 'Panel', desc: 'PV Modules supply' },
            { cat: 'MMS & Module Erection', desc: 'MMS structures & module mounting labour' },
            { cat: 'DC & AC Cabling', desc: 'DC string cables, AC power cables, earthing' },
            { cat: 'Infrastructure', desc: 'Fencing, CCTV, street lights, security room' },
            { cat: 'Liaisoning', desc: 'CEIG, LTOA, NCES, P&C clearances' },
            { cat: 'Others', desc: 'Overheads, freight, testing & commissioning' },
        ];
        const created = [];
        for (let i = 0; i < defaults.length; i++) {
            const { cat, desc } = defaults[i];
            const category = await prisma.wBSCategory.create({
                data: { projectId: req.params.id, name: cat, sortOrder: i },
            });
            await prisma.wBSLineItem.create({
                data: {
                    projectId: req.params.id, categoryId: category.id,
                    description: desc, estimated: BigInt(0), committed: BigInt(0), paid: BigInt(0), sortOrder: 0,
                },
            });
            created.push(cat);
        }
        res.status(201).json({ created, message: `${created.length} default WBS categories created` });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', requireAuth, async (req, res, next) => {
    try {
        const { name, templateId, parentId, sectorId, client, capacityMw, billable, projectHeadId } = req.body;
        if (!sectorId) {
            res.status(400).json({ error: 'sectorId is required' });
            return;
        }
        // Verify sectorId exists
        const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
        if (!sector) {
            res.status(400).json({ error: `Sector with id "${sectorId}" does not exist` });
            return;
        }
        // Verify projectHeadId exists if provided
        if (projectHeadId) {
            const headUser = await prisma.user.findUnique({ where: { id: projectHeadId } });
            if (!headUser) {
                res.status(400).json({ error: `User with id "${projectHeadId}" does not exist` });
                return;
            }
        }
        // Verify parentId exists if provided
        if (parentId) {
            const parentProject = await prisma.project.findUnique({ where: { id: parentId } });
            if (!parentProject) {
                res.status(400).json({ error: `Parent project with id "${parentId}" does not exist` });
                return;
            }
        }
        assertCan(req.user, 'create', { sectorId });
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
                const tasks = JSON.parse(template.tasksJson || '[]');
                for (const t of tasks.slice(0, 5)) {
                    await prisma.task.create({
                        data: { projectId: project.id, title: t.title, department: t.department, status: 'NOT_STARTED' },
                    });
                }
            }
        }
        await writeAudit(req.user.id, 'PROJECT_CREATED', 'Project', project.id, { name });
        res.status(201).json(project);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', requireAuth, async (req, res) => {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, 'update', ctx ?? undefined);
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
router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
        const ctx = await getProjectContext(req.params.id);
        assertCan(req.user, 'update', ctx ?? undefined);
        // Safety check: block delete if project has approved POs or payments
        const [approvedPOs, payments] = await Promise.all([
            prisma.purchaseOrder.count({ where: { projectId: req.params.id, status: 'APPROVED' } }),
            prisma.paymentRequest.count({ where: { projectId: req.params.id, status: { in: ['APPROVED', 'PAID'] } } }),
        ]);
        if (approvedPOs > 0 || payments > 0) {
            res.status(400).json({
                error: 'Cannot delete a project with approved purchase orders or payments. Archive it instead.',
                approvedPOs,
                payments,
            });
            return;
        }
        // Cascade: delete sub-projects first, then the project itself
        const subProjects = await prisma.project.findMany({ where: { parentId: req.params.id }, select: { id: true } });
        for (const sub of subProjects) {
            await prisma.project.delete({ where: { id: sub.id } });
        }
        await writeAudit(req.user.id, 'PROJECT_DELETED', 'Project', req.params.id, {});
        await prisma.project.delete({ where: { id: req.params.id } });
        res.status(204).end();
    }
    catch (err) {
        next(err);
    }
});
export default router;
