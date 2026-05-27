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

// Helper: sum paid/estimated/committed from wbsCategories → lineItems
function sumWbs(wbsCategories: { lineItems: { estimated: bigint | number; paid: bigint | number; committed: bigint | number }[] }[]) {
  const items = wbsCategories.flatMap((c) => c.lineItems);
  return {
    estimated: sumAmounts(items.map((l) => l.estimated)),
    paid:      sumAmounts(items.map((l) => l.paid)),
    committed: sumAmounts(items.map((l) => l.committed)),
  };
}

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const pf   = await projectFilter(user);

    // ── Respect ?projectId= from the top-bar selector ──────────────────────
    const requestedProjectId = req.query.projectId as string | undefined;

    // FIX: removed `parentId: { not: null }` — it was excluding top-level projects
    const projectWhere = {
      ...pf,
      ...(requestedProjectId ? { id: requestedProjectId } : {}),
    };

    // Task / PO / payment scope: same narrowing
    const scope = requestedProjectId
      ? { project: { ...pf, id: requestedProjectId } }
      : projectScope(pf);

    // FIX: include wbsCategories → lineItems instead of wbsLineItems (wrong relation name)
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        sector: true,
        wbsCategories: { include: { lineItems: true } },
        tasks: true,
        customerReceipts: true,
        customerInvoices: true,
      },
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

    // FIX: broaden "today's tasks" to all active/not-started tasks, not just
    // those with plannedEnd == today (too strict — most show nothing).
    // Show tasks that are in-progress OR not-started and plannedEnd <= today (overdue + due today).
    const todaysTasks = await prisma.task.findMany({
      where: {
        ...scope,
        status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.NOT_STARTED] },
        OR: [
          { plannedEnd: { lte: tomorrow } },  // due today or overdue
          { plannedEnd: null },                // no date set — still relevant
        ],
      },
      include: { project: true },
      orderBy: [
        { isDelayed: 'desc' },   // delayed first
        { plannedEnd: 'asc' },   // then soonest deadline
      ],
      take: 20,
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

    // Portfolio summary — only for corporate/admin, always across ALL projects
    let portfolio = null;
    if (user.role === Role.CORPORATE_OFFICE || user.role === Role.SUPER_ADMIN) {
      const all = await prisma.project.findMany({ where: {} });
      portfolio = {
        totalBillable: sumAmounts(all.map((p) => p.billable)),
        totalCost:     sumAmounts(all.map((p) => p.netCost)),
        totalProfit:   sumAmounts(all.map((p) => p.profit)),
        projectCount:  all.length,
      };
    }

    // FIX: use sumWbs() helper that reads from wbsCategories → lineItems
    const receivables = projects.map((p) => {
      const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
      const billable  = N(p.billable);
      return { projectId: p.id, name: p.name, billable, received, balance: billable - received };
    });

    const heatmap = projects.map((p) => {
      const wbs = sumWbs(p.wbsCategories);
      return {
        id: p.id, name: p.name, status: p.status,
        delayedCount: p.tasks.filter((t) => t.isDelayed).length,
        profit:   N(p.profit),
        billable: N(p.billable),
        ...wbs,
        variancePct: wbs.estimated > 0
          ? Math.round(((wbs.committed - wbs.estimated) / wbs.estimated) * 100)
          : 0,
      };
    });

    let systemStats = null;
    if (user.role === Role.SUPER_ADMIN) {
      const users      = await prisma.user.groupBy({ by: ['role'], _count: true });
      const auditToday = await prisma.auditLog.count({ where: { createdAt: { gte: today } } });
      systemStats = { usersByRole: users, auditToday };
    }

    // FIX: compute budgetSummary using sumWbs() — wbsLineItems was wrong relation
    const primary = requestedProjectId
      ? projects.find((p) => p.id === requestedProjectId) ?? projects[0]
      : projects[0];

    const budgetSummary = primary ? {
      ...sumWbs(primary.wbsCategories),
      receivableBalance: receivables.find((r) => r.projectId === primary.id)?.balance ?? 0,
    } : null;

    res.json({
      role: user.role,
      projects: projects.map((p) => {
        const wbs = sumWbs(p.wbsCategories);
        return {
          id:        p.id,
          name:      p.name,
          status:    p.status,
          billable:  N(p.billable),
          netCost:   N(p.netCost),
          profit:    N(p.profit),
          ...wbs,
        };
      }),
      delayedTasks,
      todaysTasks,
      pendingPOs:      pendingPOs.map((p)      => ({ ...p, totalAmount: N(p.totalAmount) })),
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