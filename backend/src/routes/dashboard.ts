import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { projectFilter } from '../lib/scope.js';
import { Role, TaskStatus, POStatus, PaymentRequestStatus } from '../lib/constants.js';
import { N, sumAmounts } from '../lib/money.js';
import { UserWithScope } from '../lib/rbac.js';

const router = Router();

function projectScope(pf: Awaited<ReturnType<typeof projectFilter>>) {
  return Object.keys(pf).length > 0 ? { project: pf } : {};
}

function auditFilter(user: UserWithScope) {
  if (user.role === Role.PROJECT_HEAD) return { userId: user.id };
  if (user.role === Role.SECTOR_HEAD && user.sectorId) return { user: { sectorId: user.sectorId } };
  return {};
}

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
  const user = req.user!;
  const pf = await projectFilter(user);
  const scope = projectScope(pf);
  const projects = await prisma.project.findMany({
    where: { ...pf, parentId: { not: null } },
    include: { sector: true, wbsLineItems: true, tasks: true, customerReceipts: true, customerInvoices: true },
  });

  const delayedTasks = await prisma.task.findMany({
    where: { isDelayed: true, ...scope },
    include: { project: true },
    take: 10,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysTasks = await prisma.task.findMany({
    where: {
      ...scope,
      plannedEnd: { gte: today, lt: tomorrow },
      status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.NOT_STARTED] },
    },
    include: { project: true },
    take: 10,
  });

  const pendingPOs = await prisma.purchaseOrder.findMany({
    where: { status: POStatus.PENDING_APPROVAL, ...scope },
    include: { vendor: true, project: true, requester: true },
  });

  const pendingPayments = await prisma.paymentRequest.findMany({
    where: { status: PaymentRequestStatus.PENDING_APPROVAL, ...scope },
    include: { po: { include: { vendor: true } }, project: true, requester: true },
  });

  const recentAudit = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { user: true },
    where: auditFilter(user),
  });

  let portfolio = null;
  if (user.role === Role.CORPORATE_OFFICE || user.role === Role.SUPER_ADMIN) {
    const all = await prisma.project.findMany({ where: { parentId: { not: null } } });
    portfolio = {
      totalBillable: sumAmounts(all.map((p) => p.billable)),
      totalCost: sumAmounts(all.map((p) => p.netCost)),
      totalProfit: sumAmounts(all.map((p) => p.profit)),
      projectCount: all.length,
    };
  }

  const receivables = projects.map((p) => {
    const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
    const billable = N(p.billable);
    return { projectId: p.id, name: p.name, billable, received, balance: billable - received };
  });

  const heatmap = projects.map((p) => {
    const estimated = sumAmounts(p.wbsLineItems.map((l) => l.estimated));
    const paid = sumAmounts(p.wbsLineItems.map((l) => l.paid));
    const committed = sumAmounts(p.wbsLineItems.map((l) => l.committed));
    return {
      id: p.id, name: p.name, status: p.status,
      delayedCount: p.tasks.filter((t) => t.isDelayed).length,
      profit: N(p.profit), billable: N(p.billable),
      estimated, paid, committed,
      variancePct: estimated > 0 ? Math.round(((committed - estimated) / estimated) * 100) : 0,
    };
  });

  let systemStats = null;
  if (user.role === Role.SUPER_ADMIN) {
    const users = await prisma.user.groupBy({ by: ['role'], _count: true });
    const auditToday = await prisma.auditLog.count({
      where: { createdAt: { gte: today } },
    });
    systemStats = { usersByRole: users, auditToday };
  }

  const primary = projects[0];
  const budgetSummary = primary ? {
    estimated: sumAmounts(primary.wbsLineItems.map((l) => l.estimated)),
    paid: sumAmounts(primary.wbsLineItems.map((l) => l.paid)),
    committed: sumAmounts(primary.wbsLineItems.map((l) => l.committed)),
    receivableBalance: receivables.find((r) => r.projectId === primary.id)?.balance ?? 0,
  } : null;

  res.json({
    role: user.role,
    projects: projects.map((p) => ({
      id: p.id, name: p.name, status: p.status, billable: N(p.billable),
      netCost: N(p.netCost), profit: N(p.profit),
      paid: sumAmounts(p.wbsLineItems.map((l) => l.paid)),
      estimated: sumAmounts(p.wbsLineItems.map((l) => l.estimated)),
      committed: sumAmounts(p.wbsLineItems.map((l) => l.committed)),
    })),
    delayedTasks,
    todaysTasks,
    pendingPOs: pendingPOs.map((p) => ({ ...p, totalAmount: N(p.totalAmount) })),
    pendingPayments: pendingPayments.map((p) => ({ ...p, amount: N(p.amount) })),
    recentAudit,
    portfolio,
    receivables,
    heatmap,
    systemStats,
    budgetSummary,
  });
  } catch (err) {
    next(err);
  }
});

export default router;
