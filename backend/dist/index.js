// src/index.ts
import express from "express";
import cors from "cors";
import session from "express-session";
import path3 from "path";
import fs2 from "fs";
import { fileURLToPath } from "url";

// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
var prisma = new PrismaClient();

// src/middleware/auth.ts
async function loadUser(req, _res, next) {
  if (!req.session?.userId) return next();
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    include: { projectAssignments: true }
  });
  if (user) {
    req.user = {
      ...user,
      projectIds: user.projectAssignments?.map((a) => a.projectId) ?? []
    };
    next();
  }
}
function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcrypt";
var router = Router();
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { projectAssignments: true }
  });
  if (!user || !await bcrypt.compare(password, user.password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  req.session.userId = user.id;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sectorId: user.sectorId,
    projectIds: user.projectAssignments.map((a) => a.projectId)
  });
});
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
router.get("/me", requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    sectorId: u.sectorId,
    projectIds: u.projectIds
  });
});
router.get("/demo-users", requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { role: "asc" }
  });
  res.json(users);
});
router.post("/demo-switch", requireAuth, async (req, res) => {
  const { userId } = req.body;
  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { projectAssignments: true }
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  req.session.userId = target.id;
  res.json({
    id: target.id,
    email: target.email,
    name: target.name,
    role: target.role,
    sectorId: target.sectorId,
    projectIds: target.projectAssignments.map((a) => a.projectId)
  });
});
var auth_default = router;

// src/routes/dashboard.ts
import { Router as Router2 } from "express";

// src/lib/constants.ts
var Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  CORPORATE_OFFICE: "CORPORATE_OFFICE",
  SECTOR_HEAD: "SECTOR_HEAD",
  PROJECT_HEAD: "PROJECT_HEAD"
};
var TaskStatus = { NOT_STARTED: "NOT_STARTED", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", ON_HOLD: "ON_HOLD" };
var QuotationRequestStatus = { DRAFT: "DRAFT", QUOTES_PENDING: "QUOTES_PENDING", COMPARISON: "COMPARISON", WINNER_SELECTED: "WINNER_SELECTED", PO_CREATED: "PO_CREATED", CANCELLED: "CANCELLED" };
var POStatus = { DRAFT: "DRAFT", PENDING_APPROVAL: "PENDING_APPROVAL", APPROVED: "APPROVED", REJECTED: "REJECTED", RETURNED: "RETURNED", SENT_TO_VENDOR: "SENT_TO_VENDOR" };
var PaymentRequestStatus = { DRAFT: "DRAFT", PENDING_APPROVAL: "PENDING_APPROVAL", APPROVED: "APPROVED", REJECTED: "REJECTED", RETURNED: "RETURNED", PAID: "PAID" };
var InvoiceType = { PROFORMA: "PROFORMA", TAX: "TAX" };
var InvoiceStatus = { DRAFT: "DRAFT", ISSUED: "ISSUED", CANCELLED: "CANCELLED" };

// src/lib/scope.ts
async function getAccessibleProjectIds(user) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.CORPORATE_OFFICE) return "all";
  if (user.role === Role.SECTOR_HEAD && user.sectorId) {
    const projects = await prisma.project.findMany({
      where: { sectorId: user.sectorId },
      select: { id: true }
    });
    return projects.map((p) => p.id);
  }
  const directIds = user.projectIds ?? [];
  if (directIds.length === 0) return [];
  const directProjects = await prisma.project.findMany({
    where: { id: { in: directIds } },
    select: { id: true, parentId: true }
  });
  const allIds = new Set(directIds);
  const parentIds = directProjects.filter((p) => p.parentId === null).map((p) => p.id);
  if (parentIds.length > 0) {
    const subs = await prisma.project.findMany({
      where: { parentId: { in: parentIds } },
      select: { id: true }
    });
    subs.forEach((s) => allIds.add(s.id));
  }
  const subParentIds = directProjects.filter((p) => p.parentId !== null).map((p) => p.parentId);
  subParentIds.forEach((pid) => allIds.add(pid));
  return Array.from(allIds);
}
async function projectFilter(user) {
  const ids = await getAccessibleProjectIds(user);
  if (ids === "all") return {};
  if (user.role === Role.SECTOR_HEAD && user.sectorId) return { sectorId: user.sectorId };
  return { id: { in: ids } };
}
async function getProjectContext(projectId) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { sector: true }
  });
  return p ? { sectorId: p.sectorId, projectId: p.id } : null;
}

// src/lib/money.ts
function N(v) {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}
function sumAmounts(values) {
  return values.reduce((s, v) => s + N(v), 0);
}

// src/routes/dashboard.ts
var router2 = Router2();
function projectScope(pf) {
  return Object.keys(pf).length > 0 ? { project: pf } : {};
}
function auditFilter(user) {
  if (user.role === Role.PROJECT_HEAD) return { userId: user.id };
  if (user.role === Role.SECTOR_HEAD && user.sectorId) return { user: { sectorId: user.sectorId } };
  return {};
}
router2.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    const pf = await projectFilter(user);
    const requestedProjectId = req.query.projectId;
    const projectWhere = {
      ...pf,
      parentId: { not: null },
      ...requestedProjectId ? { id: requestedProjectId } : {}
    };
    const scope = requestedProjectId ? { project: { ...pf, id: requestedProjectId } } : projectScope(pf);
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        sector: true,
        wbsLineItems: true,
        tasks: true,
        customerReceipts: true,
        customerInvoices: true
      }
    });
    const delayedTasks = await prisma.task.findMany({
      where: { isDelayed: true, ...scope },
      include: { project: true },
      take: 10
    });
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todaysTasks = await prisma.task.findMany({
      where: {
        ...scope,
        plannedEnd: { gte: today, lt: tomorrow },
        status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.NOT_STARTED] }
      },
      include: { project: true },
      take: 10
    });
    const pendingPOs = await prisma.purchaseOrder.findMany({
      where: { status: POStatus.PENDING_APPROVAL, ...scope },
      include: { vendor: true, project: true, requester: true }
    });
    const pendingPayments = await prisma.paymentRequest.findMany({
      where: { status: PaymentRequestStatus.PENDING_APPROVAL, ...scope },
      include: { po: { include: { vendor: true } }, project: true, requester: true }
    });
    const recentAudit = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: true },
      where: auditFilter(user)
    });
    let portfolio = null;
    if (user.role === Role.CORPORATE_OFFICE || user.role === Role.SUPER_ADMIN) {
      const all = await prisma.project.findMany({ where: { parentId: { not: null } } });
      portfolio = {
        totalBillable: sumAmounts(all.map((p) => p.billable)),
        totalCost: sumAmounts(all.map((p) => p.netCost)),
        totalProfit: sumAmounts(all.map((p) => p.profit)),
        projectCount: all.length
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
        id: p.id,
        name: p.name,
        status: p.status,
        delayedCount: p.tasks.filter((t) => t.isDelayed).length,
        profit: N(p.profit),
        billable: N(p.billable),
        estimated,
        paid,
        committed,
        variancePct: estimated > 0 ? Math.round((committed - estimated) / estimated * 100) : 0
      };
    });
    let systemStats = null;
    if (user.role === Role.SUPER_ADMIN) {
      const users = await prisma.user.groupBy({ by: ["role"], _count: true });
      const auditToday = await prisma.auditLog.count({ where: { createdAt: { gte: today } } });
      systemStats = { usersByRole: users, auditToday };
    }
    const primary = requestedProjectId ? projects.find((p) => p.id === requestedProjectId) ?? projects[0] : projects[0];
    const budgetSummary = primary ? {
      estimated: sumAmounts(primary.wbsLineItems.map((l) => l.estimated)),
      paid: sumAmounts(primary.wbsLineItems.map((l) => l.paid)),
      committed: sumAmounts(primary.wbsLineItems.map((l) => l.committed)),
      receivableBalance: receivables.find((r) => r.projectId === primary.id)?.balance ?? 0
    } : null;
    res.json({
      role: user.role,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        billable: N(p.billable),
        netCost: N(p.netCost),
        profit: N(p.profit),
        paid: sumAmounts(p.wbsLineItems.map((l) => l.paid)),
        estimated: sumAmounts(p.wbsLineItems.map((l) => l.estimated)),
        committed: sumAmounts(p.wbsLineItems.map((l) => l.committed))
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
      budgetSummary
    });
  } catch (err) {
    next(err);
  }
});
var dashboard_default = router2;

// src/routes/projects.ts
import { Router as Router3 } from "express";

// src/lib/rbac.ts
function can(user, action, resource) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }
  if (user.role === "CORPORATE_OFFICE") {
    if (action === "read" || action === "create" || action === "update" || action === "approve" || action === "audit:read" || action === "reports:export") {
      return true;
    }
    return false;
  }
  if (user.role === "SECTOR_HEAD") {
    if (action === "read" || action === "create" || action === "update" || action === "approve") {
      if (!resource?.sectorId) {
        return true;
      }
      return user.sectorId === resource.sectorId;
    }
    return false;
  }
  if (user.role === "PROJECT_HEAD") {
    if (action === "read" || action === "update") {
      return true;
    }
    return false;
  }
  return false;
}
function assertCan(user, action, resource) {
  const allowed = can(user, action, resource);
  if (!allowed) {
    console.warn(
      `Forbidden: ${user.role} cannot perform ${action}`
    );
    return false;
  }
  return true;
}
function blockMakerChecker(makerId, checkerId) {
  if (makerId === checkerId) {
    console.warn(
      "Maker-checker violation detected"
    );
    return false;
  }
  return true;
}
function blockSelfApproval(requesterId, approverId) {
  if (requesterId === approverId) {
    console.warn(
      "Self approval blocked"
    );
    return false;
  }
  return true;
}

// src/lib/audit.ts
async function writeAudit(userId, action, entityType, entityId, metadata) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

// src/routes/projects.ts
var router3 = Router3();
router3.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projects = await prisma.project.findMany({
      where: pf,
      include: { sector: true, subProjects: true, parent: true, assignments: { include: { user: true } } },
      orderBy: { name: "asc" }
    });
    const userId = req.user.id;
    const role = req.user.role;
    const scoped = role === "PROJECT_HEAD" ? projects.filter(
      (p) => p.assignments.some((a) => a.userId === userId)
    ) : projects;
    res.json(scoped);
  } catch (err) {
    next(err);
  }
});
router3.get("/eligible-heads", requireAuth, async (req, res, next) => {
  try {
    const heads = await prisma.user.findMany({
      where: { role: "PROJECT_HEAD" },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { name: "asc" }
    });
    res.json(heads);
  } catch (err) {
    next(err);
  }
});
router3.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "read", ctx ?? void 0);
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        sector: true,
        subProjects: true,
        parent: true,
        assignments: { include: { user: true } },
        wbsCategories: { include: { lineItems: true }, orderBy: { sortOrder: "asc" } },
        customerReceipts: true,
        customerInvoices: true
      }
    });
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [tasks, pos, payments, invoices, documents] = await Promise.all([
      prisma.task.count({ where: { projectId: project.id } }),
      prisma.purchaseOrder.count({ where: { projectId: project.id } }),
      prisma.paymentRequest.count({ where: { projectId: project.id } }),
      prisma.customerInvoice.count({ where: { projectId: project.id } }),
      prisma.document.count({ where: { projectId: project.id } })
    ]);
    const audit = await prisma.auditLog.count({
      where: { entityType: "Project", entityId: project.id }
    });
    res.json({
      ...project,
      _counts: { tasks, pos, payments, invoices, documents, audit }
    });
  } catch (err) {
    next(err);
  }
});
router3.get("/:id/wbs", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "read", ctx ?? void 0);
    const categories = await prisma.wBSCategory.findMany({
      where: { projectId: req.params.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" }
    });
    const enriched = await Promise.all(categories.map(async (cat) => ({
      ...cat,
      lineItems: await Promise.all(cat.lineItems.map(async (li) => {
        const pos = await prisma.pOLineItem.findMany({
          where: { lineItemId: li.id, po: { status: "APPROVED" } },
          include: { po: { include: { vendor: true } } }
        });
        return {
          ...li,
          remaining: N(li.estimated) - N(li.paid),
          variance: N(li.committed) - N(li.estimated),
          contributingPOs: pos.map((p) => ({ poNumber: p.po.poNumber, vendor: p.po.vendor.name, amount: N(p.amount) }))
        };
      })),
      totals: {
        estimated: sumAmounts(cat.lineItems.map((l) => l.estimated)),
        committed: sumAmounts(cat.lineItems.map((l) => l.committed)),
        paid: sumAmounts(cat.lineItems.map((l) => l.paid))
      }
    })));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});
router3.post("/:id/wbs/line-items", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "create", ctx ?? void 0);
    const { categoryName, description, estimated } = req.body;
    if (!categoryName || !description) {
      res.status(400).json({ error: "categoryName and description are required" });
      return;
    }
    let cat = await prisma.wBSCategory.findFirst({
      where: { projectId: req.params.id, name: categoryName }
    });
    if (!cat) {
      const count2 = await prisma.wBSCategory.count({ where: { projectId: req.params.id } });
      cat = await prisma.wBSCategory.create({
        data: { projectId: req.params.id, name: categoryName, sortOrder: count2 }
      });
    }
    const count = await prisma.wBSLineItem.count({ where: { categoryId: cat.id } });
    const li = await prisma.wBSLineItem.create({
      data: {
        projectId: req.params.id,
        categoryId: cat.id,
        description,
        estimated: BigInt(estimated ?? 0),
        committed: BigInt(0),
        paid: BigInt(0),
        sortOrder: count
      }
    });
    res.status(201).json({ ...li, categoryName: cat.name });
  } catch (err) {
    next(err);
  }
});
router3.patch("/:id/wbs/line-items/:lineItemId", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "update", ctx ?? void 0);
    const { estimated } = req.body;
    if (estimated == null || isNaN(Number(estimated))) {
      res.status(400).json({ error: "estimated is required and must be a number" });
      return;
    }
    const li = await prisma.wBSLineItem.update({
      where: { id: req.params.lineItemId },
      data: { estimated: BigInt(Math.round(Number(estimated))) }
    });
    res.json({ ...li, estimated: Number(li.estimated) });
  } catch (err) {
    next(err);
  }
});
router3.post("/:id/wbs/seed-defaults", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "create", ctx ?? void 0);
    const existing = await prisma.wBSCategory.count({ where: { projectId: req.params.id } });
    if (existing > 0) {
      res.status(400).json({ error: "Project already has WBS items" });
      return;
    }
    const defaults = [
      { cat: "Land", desc: "Land acquisition / lease" },
      { cat: "33KV Transmission Line", desc: "33KV transmission line works" },
      { cat: "Substation Work", desc: "Substation civil & equipment" },
      { cat: "Yard & Civil", desc: "Yard grading, roads & civil foundation" },
      { cat: "Yard Products", desc: "Transformer, HT Breaker, LT Panel, Inverter" },
      { cat: "Panel", desc: "PV Modules supply" },
      { cat: "MMS & Module Erection", desc: "MMS structures & module mounting labour" },
      { cat: "DC & AC Cabling", desc: "DC string cables, AC power cables, earthing" },
      { cat: "Infrastructure", desc: "Fencing, CCTV, street lights, security room" },
      { cat: "Liaisoning", desc: "CEIG, LTOA, NCES, P&C clearances" },
      { cat: "Others", desc: "Overheads, freight, testing & commissioning" }
    ];
    const created = [];
    for (let i = 0; i < defaults.length; i++) {
      const { cat, desc } = defaults[i];
      const category = await prisma.wBSCategory.create({
        data: { projectId: req.params.id, name: cat, sortOrder: i }
      });
      await prisma.wBSLineItem.create({
        data: {
          projectId: req.params.id,
          categoryId: category.id,
          description: desc,
          estimated: BigInt(0),
          committed: BigInt(0),
          paid: BigInt(0),
          sortOrder: 0
        }
      });
      created.push(cat);
    }
    res.status(201).json({ created, message: `${created.length} default WBS categories created` });
  } catch (err) {
    next(err);
  }
});
router3.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, templateId, parentId, sectorId, client, capacityMw, billable, projectHeadId } = req.body;
    if (!sectorId) {
      res.status(400).json({ error: "sectorId is required" });
      return;
    }
    const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
    if (!sector) {
      res.status(400).json({ error: `Sector with id "${sectorId}" does not exist` });
      return;
    }
    if (projectHeadId) {
      const headUser = await prisma.user.findUnique({ where: { id: projectHeadId } });
      if (!headUser) {
        res.status(400).json({ error: `User with id "${projectHeadId}" does not exist` });
        return;
      }
    }
    if (parentId) {
      const parentProject = await prisma.project.findUnique({ where: { id: parentId } });
      if (!parentProject) {
        res.status(400).json({ error: `Parent project with id "${parentId}" does not exist` });
        return;
      }
    }
    assertCan(req.user, "create", { sectorId });
    const project = await prisma.project.create({
      data: {
        name,
        sectorId,
        parentId: parentId || null,
        client,
        capacityMw,
        billable: BigInt(billable ?? 0),
        netCost: BigInt(0),
        profit: BigInt(0),
        assignments: projectHeadId ? { create: [{ userId: projectHeadId }] } : void 0
      }
    });
    if (templateId) {
      const template = await prisma.template.findUnique({ where: { id: templateId } });
      if (template) {
        const tasks = JSON.parse(template.tasksJson || "[]");
        for (const t of tasks.slice(0, 5)) {
          await prisma.task.create({
            data: { projectId: project.id, title: t.title, department: t.department, status: "NOT_STARTED" }
          });
        }
      }
    }
    await writeAudit(req.user.id, "PROJECT_CREATED", "Project", project.id, { name });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});
router3.patch("/:id", requireAuth, async (req, res) => {
  const ctx = await getProjectContext(req.params.id);
  assertCan(req.user, "update", ctx ?? void 0);
  const { name, client, status, billable, netCost } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...name && { name },
      ...client && { client },
      ...status && { status },
      ...billable != null && { billable: BigInt(billable) },
      ...netCost != null && { netCost: BigInt(netCost) }
    }
  });
  res.json(project);
});
router3.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const ctx = await getProjectContext(req.params.id);
    assertCan(req.user, "update", ctx ?? void 0);
    const [approvedPOs, payments] = await Promise.all([
      prisma.purchaseOrder.count({ where: { projectId: req.params.id, status: "APPROVED" } }),
      prisma.paymentRequest.count({ where: { projectId: req.params.id, status: { in: ["APPROVED", "PAID"] } } })
    ]);
    if (approvedPOs > 0 || payments > 0) {
      res.status(400).json({
        error: "Cannot delete a project with approved purchase orders or payments. Archive it instead.",
        approvedPOs,
        payments
      });
      return;
    }
    const subProjects = await prisma.project.findMany({ where: { parentId: req.params.id }, select: { id: true } });
    for (const sub of subProjects) {
      await prisma.project.delete({ where: { id: sub.id } });
    }
    await writeAudit(req.user.id, "PROJECT_DELETED", "Project", req.params.id, {});
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
var projects_default = router3;

// src/routes/tasks.ts
import { Router as Router4 } from "express";
var router4 = Router4();
router4.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const { projectId, department, status } = req.query;
    const where = {
      project: pf
    };
    if (projectId) {
      where.projectId = String(projectId);
    }
    if (department) {
      where.department = String(department);
    }
    if (status) {
      where.status = String(status);
    }
    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: true
      },
      orderBy: [
        { department: "asc" },
        { plannedEnd: "asc" }
      ]
    });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});
router4.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(task.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { status, remarks, title, department, plannedEnd, plannedStart } = req.body;
    const today = /* @__PURE__ */ new Date();
    const resolvedStatus = status ?? task.status;
    const resolvedPlannedEnd = plannedEnd ? new Date(plannedEnd) : task.plannedEnd;
    const isDelayed = resolvedPlannedEnd && resolvedPlannedEnd < today && resolvedStatus === TaskStatus.IN_PROGRESS;
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...title != null && { title },
        ...department != null && { department },
        ...plannedStart != null && { plannedStart: new Date(plannedStart) },
        ...plannedEnd != null && { plannedEnd: new Date(plannedEnd) },
        status: resolvedStatus,
        remarks: remarks ?? task.remarks,
        isDelayed: isDelayed ?? task.isDelayed,
        updatedById: req.user.id,
        actualStart: resolvedStatus === TaskStatus.IN_PROGRESS && !task.actualStart ? today : task.actualStart,
        actualEnd: resolvedStatus === TaskStatus.COMPLETED ? today : task.actualEnd
      }
    });
    await writeAudit(req.user.id, "TASK_UPDATED", "Task", task.id, { title: task.title, status });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router4.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(task.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    await writeAudit(req.user.id, "TASK_DELETED", "Task", task.id, { title: task.title });
    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
router4.post("/", requireAuth, async (req, res, next) => {
  try {
    const { projectId, title, department, status, plannedStart, plannedEnd, remarks } = req.body;
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(400).json({ error: `Project with id "${projectId}" does not exist` });
      return;
    }
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const task = await prisma.task.create({
      data: {
        projectId,
        title,
        department,
        status: status ?? TaskStatus.NOT_STARTED,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        remarks
      },
      include: { project: true }
    });
    await writeAudit(req.user.id, "TASK_CREATED", "Task", task.id, { title });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});
var tasks_default = router4;

// src/routes/vendors.ts
import { Router as Router5 } from "express";

// src/schemas/index.ts
import { z } from "zod";
var vendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  bankName: z.string().optional(),
  // ← was "bankAccount" before — now matches Prisma
  accountNo: z.string().optional(),
  // ← new field matching Prisma
  ifsc: z.string().optional(),
  // ← new field matching Prisma
  contact: z.string().optional()
});
var taskCreateSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  department: z.string().min(1),
  status: z.string().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  remarks: z.string().optional()
});
var projectCreateSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().optional(),
  parentId: z.string().optional(),
  sectorId: z.string(),
  client: z.string().optional(),
  capacityMw: z.number().optional(),
  billable: z.number().optional(),
  projectHeadId: z.string().optional()
});
var userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "CORPORATE_OFFICE", "SECTOR_HEAD", "PROJECT_HEAD"]),
  password: z.string().min(6).optional(),
  sectorId: z.string().optional().nullable(),
  projectIds: z.array(z.string()).optional()
});
var userUpdateSchema = userCreateSchema.partial().extend({
  active: z.boolean().optional()
});

// src/routes/vendors.ts
var router5 = Router5();
router5.get("/", requireAuth, async (_req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
    res.json(vendors);
  } catch (err) {
    next(err);
  }
});
router5.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = vendorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    assertCan(req.user, "create");
    const vendor = await prisma.vendor.create({ data: parsed.data });
    await writeAudit(req.user.id, "VENDOR_CREATED", "Vendor", vendor.id, { name: vendor.name });
    res.status(201).json(vendor);
  } catch (err) {
    next(err);
  }
});
router5.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: {
        purchaseOrders: { include: { project: true, lineItems: true } }
      }
    });
    if (!vendor) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const totalBusiness = sumAmounts(vendor.purchaseOrders.map((p) => p.totalAmount));
    const approved = vendor.purchaseOrders.filter((p) => p.status === "APPROVED").length;
    res.json({
      ...vendor,
      purchaseOrders: vendor.purchaseOrders.map((p) => ({ ...p, totalAmount: N(p.totalAmount) })),
      performance: { totalBusiness, onTimePercent: approved > 0 ? 92 : 0, poCount: vendor.purchaseOrders.length }
    });
  } catch (err) {
    next(err);
  }
});
router5.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = vendorSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    assertCan(req.user, "update");
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: parsed.data });
    await writeAudit(req.user.id, "VENDOR_UPDATED", "Vendor", vendor.id);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
});
router5.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    assertCan(req.user, "delete");
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    await prisma.vendor.delete({ where: { id: req.params.id } });
    await writeAudit(req.user.id, "VENDOR_DELETED", "Vendor", req.params.id, { name: vendor.name });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
var vendors_default = router5;

// src/routes/quotations.ts
import { Router as Router6 } from "express";
var router6 = Router6();
function unpackQuote(q) {
  if (typeof q.notes === "string") {
    try {
      const parsed = JSON.parse(q.notes);
      if (parsed._meta) {
        return {
          ...q,
          gstPct: parsed.gstPct ?? null,
          paymentTerms: parsed.paymentTerms ?? null,
          notes: parsed.notes ?? null
        };
      }
    } catch {
    }
  }
  return q;
}
router6.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const items = await prisma.quotationRequest.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true, quotations: { include: { vendor: true } }, lineItem: true },
      orderBy: { createdAt: "desc" }
    });
    const enriched = items.map((item) => ({
      ...item,
      quotations: item.quotations.map((q) => unpackQuote(q))
    }));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});
router6.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.quotationRequest.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        lineItem: true,
        quotations: {
          include: { vendor: true },
          orderBy: { amount: "asc" }
        }
      }
    });
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const enriched = {
      ...item,
      quotations: item.quotations.map((q) => unpackQuote(q))
    };
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});
router6.post("/", requireAuth, async (req, res, next) => {
  try {
    const { projectId, lineItemId, title, description, quantity, targetDeliveryDate, vendorsInvited } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const qr = await prisma.quotationRequest.create({
      data: {
        projectId,
        lineItemId,
        title,
        description,
        requesterId: req.user.id,
        status: QuotationRequestStatus.QUOTES_PENDING,
        // FR-6.1 AC1: extra fields stored in description until schema migration
        ...quantity || targetDeliveryDate || vendorsInvited ? {
          description: JSON.stringify({
            _meta: true,
            description: description ?? null,
            quantity: quantity ?? null,
            targetDeliveryDate: targetDeliveryDate ?? null,
            vendorsInvited: vendorsInvited ?? []
          })
        } : {}
      },
      include: { project: true, lineItem: true }
    });
    res.status(201).json(qr);
  } catch (err) {
    next(err);
  }
});
router6.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { title, description } = req.body;
    const updated = await prisma.quotationRequest.update({
      where: { id: req.params.id },
      data: {
        ...title !== void 0 ? { title } : {},
        ...description !== void 0 ? { description } : {}
      },
      include: { project: true, lineItem: true }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router6.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({
      where: { id: req.params.id },
      include: { quotations: true }
    });
    if (!qr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "delete", ctx ?? void 0);
    await prisma.quotation.deleteMany({ where: { requestId: qr.id } });
    await prisma.quotationRequest.delete({ where: { id: qr.id } });
    await writeAudit(req.user.id, "QUOTATION_REQUEST_DELETED", "QuotationRequest", qr.id, {
      title: qr.title,
      quotationsDeleted: qr.quotations.length
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
router6.post("/:id/quotes", requireAuth, async (req, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { vendorId, amount, deliveryDays, notes, gstPct, paymentTerms, unitPrice, quantity } = req.body;
    const notesValue = gstPct != null || paymentTerms || unitPrice != null || quantity != null ? JSON.stringify({
      gstPct: gstPct ?? null,
      paymentTerms: paymentTerms ?? null,
      unitPrice: unitPrice ?? null,
      quantity: quantity ?? null,
      _meta: true,
      notes: notes ?? null
    }) : notes ?? void 0;
    const q = await prisma.quotation.create({
      data: { requestId: qr.id, vendorId, amount, deliveryDays, notes: notesValue },
      include: { vendor: true }
    });
    await prisma.quotationRequest.update({
      where: { id: qr.id },
      data: { status: QuotationRequestStatus.COMPARISON }
    });
    res.status(201).json(unpackQuote(q));
  } catch (err) {
    next(err);
  }
});
router6.patch("/:id/quotes/:quoteId", requireAuth, async (req, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) {
      res.status(404).json({ error: "QR not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.quoteId } });
    if (!existing || existing.requestId !== qr.id) {
      res.status(404).json({ error: "Quote not found in this request" });
      return;
    }
    const { amount, deliveryDays, gstPct, paymentTerms, notes } = req.body;
    const notesValue = gstPct != null || paymentTerms != null ? JSON.stringify({
      _meta: true,
      gstPct: gstPct ?? null,
      paymentTerms: paymentTerms ?? null,
      notes: notes ?? null
    }) : notes !== void 0 ? notes ?? null : void 0;
    const updated = await prisma.quotation.update({
      where: { id: req.params.quoteId },
      data: {
        ...amount !== void 0 ? { amount } : {},
        ...deliveryDays !== void 0 ? { deliveryDays } : {},
        ...notesValue !== void 0 ? { notes: notesValue } : {}
      },
      include: { vendor: true }
    });
    res.json(unpackQuote(updated));
  } catch (err) {
    next(err);
  }
});
router6.delete("/:id/quotes/:quoteId", requireAuth, async (req, res, next) => {
  try {
    const qr = await prisma.quotationRequest.findUnique({ where: { id: req.params.id } });
    if (!qr) {
      res.status(404).json({ error: "QR not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const quote = await prisma.quotation.findUnique({ where: { id: req.params.quoteId } });
    if (!quote || quote.requestId !== qr.id) {
      res.status(404).json({ error: "Quote not found in this request" });
      return;
    }
    await prisma.quotation.delete({ where: { id: req.params.quoteId } });
    if (quote.isWinner) {
      const remaining = await prisma.quotation.count({ where: { requestId: qr.id } });
      await prisma.quotationRequest.update({
        where: { id: qr.id },
        data: {
          status: remaining > 0 ? QuotationRequestStatus.COMPARISON : QuotationRequestStatus.QUOTES_PENDING,
          winnerId: null,
          winnerReason: null
        }
      });
    } else {
      const remaining = await prisma.quotation.count({ where: { requestId: qr.id } });
      if (remaining === 0) {
        await prisma.quotationRequest.update({
          where: { id: qr.id },
          data: { status: QuotationRequestStatus.QUOTES_PENDING }
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
router6.post("/:id/select-winner", requireAuth, async (req, res, next) => {
  try {
    const { quotationId, reason } = req.body;
    const qr = await prisma.quotationRequest.findUnique({
      where: { id: req.params.id },
      include: { quotations: { include: { vendor: true } }, lineItem: true, project: true }
    });
    if (!qr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(qr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const winner = qr.quotations.find((q) => q.id === quotationId);
    if (!winner) {
      res.status(400).json({ error: "Quotation not found in this request" });
      return;
    }
    const lowestAmount = Math.min(...qr.quotations.map((q) => N(q.amount)));
    const winnerAmount = N(winner.amount);
    const isLowest = winnerAmount <= lowestAmount;
    if (!isLowest && (!reason || !reason.trim())) {
      res.status(400).json({
        error: "A reason is required when selecting a non-lowest-price quote (FR-6.2 AC2)",
        requiresReason: true
      });
      return;
    }
    await prisma.quotation.updateMany({ where: { requestId: qr.id }, data: { isWinner: false } });
    await prisma.quotation.update({ where: { id: quotationId }, data: { isWinner: true } });
    const count = await prisma.purchaseOrder.count();
    const poNumber = `PO-2026-${String(count + 1).padStart(3, "0")}`;
    const amount = BigInt(Math.round(Number(winner.amount)));
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        projectId: qr.projectId,
        vendorId: winner.vendorId,
        title: qr.title,
        totalAmount: amount,
        status: POStatus.DRAFT,
        requesterId: req.user.id,
        quotationRequestId: qr.id,
        lineItems: {
          create: [{ lineItemId: qr.lineItemId, description: qr.title, amount }]
        }
      },
      include: { vendor: true, lineItems: true }
    });
    await prisma.quotationRequest.update({
      where: { id: qr.id },
      data: { status: QuotationRequestStatus.PO_CREATED, winnerId: quotationId, winnerReason: reason }
    });
    await writeAudit(req.user.id, "QUOTE_WINNER_SELECTED", "QuotationRequest", qr.id, {
      quotationId,
      vendorId: winner.vendorId,
      amount: N(winner.amount),
      isLowestPrice: isLowest,
      reason: reason ?? null,
      poNumber
    });
    res.json({ quotationRequest: { ...qr, status: QuotationRequestStatus.PO_CREATED }, purchaseOrder: po });
  } catch (err) {
    next(err);
  }
});
var quotations_default = router6;

// src/routes/pos.ts
import { Router as Router7 } from "express";

// src/lib/budget.ts
async function recalcLineItem(lineItemId) {
  const approvedPOs = await prisma.pOLineItem.findMany({
    where: { lineItemId, po: { status: POStatus.APPROVED } },
    include: { po: true }
  });
  const committed = approvedPOs.reduce((s, l) => s + l.amount, 0n);
  const payments = await prisma.paymentRequest.findMany({
    where: { lineItemId, status: PaymentRequestStatus.PAID },
    include: { payment: true }
  });
  const paid = payments.reduce((s, p) => s + (p.payment?.amount ?? p.amount), 0n);
  await prisma.wBSLineItem.update({
    where: { id: lineItemId },
    data: { committed, paid }
  });
}

// src/lib/approvals.ts
function resolveRequiredApproverRole(amount) {
  if (amount <= 5e4) return Role.PROJECT_HEAD;
  if (amount <= 5e5) return Role.SECTOR_HEAD;
  return Role.CORPORATE_OFFICE;
}
function canRoleApprove(role, amount) {
  const required = resolveRequiredApproverRole(amount);
  const hierarchy = {
    [Role.PROJECT_HEAD]: 1,
    [Role.SECTOR_HEAD]: 2,
    [Role.CORPORATE_OFFICE]: 3,
    [Role.SUPER_ADMIN]: 4
  };
  return hierarchy[role] >= hierarchy[required];
}

// src/routes/pos.ts
var router7 = Router7();
async function buildBudgetImpact(lineItems, poStatus) {
  const alreadyCounted = poStatus === POStatus.APPROVED || poStatus === POStatus.SENT_TO_VENDOR;
  return Promise.all(lineItems.map(async (li) => {
    const line = await prisma.wBSLineItem.findUnique({ where: { id: li.lineItemId } });
    const committed = N(line?.committed);
    const estimated = N(line?.estimated);
    const liAmount = N(li.amount);
    const newCommitted = alreadyCounted ? committed : committed + liAmount;
    return {
      lineItemId: li.lineItemId,
      description: li.description,
      currentCommitted: committed,
      newCommitted,
      estimated,
      breach: newCommitted > estimated
    };
  }));
}
router7.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const pos = await prisma.purchaseOrder.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(pos);
  } catch (err) {
    next(err);
  }
});
router7.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { vendor: true, project: true, requester: true, approver: true, lineItems: { include: { lineItem: true } } }
    });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "read", ctx ?? void 0);
    const budgetImpact = await buildBudgetImpact(po.lineItems, po.status);
    const versions = await prisma.pOVersion?.findMany?.({
      where: { purchaseOrderId: po.id },
      orderBy: { version: "desc" }
    }).catch(() => []) ?? [];
    res.json({ ...po, budgetImpact, versions });
  } catch (err) {
    next(err);
  }
});
router7.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (po.status !== POStatus.DRAFT && po.status !== POStatus.RETURNED) {
      res.status(400).json({ error: `Cannot edit a PO in status ${po.status}` });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { title, totalAmount, deliveryDate, paymentTerms } = req.body;
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        ...title && { title },
        ...totalAmount != null && { totalAmount: BigInt(totalAmount) },
        ...deliveryDate && { deliveryDate: new Date(deliveryDate) },
        ...paymentTerms && { paymentTerms },
        status: POStatus.DRAFT
      },
      include: { vendor: true, lineItems: true }
    });
    await writeAudit(req.user.id, "PO_EDITED", "PurchaseOrder", po.id, { poNumber: po.poNumber });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/submit", requireAuth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.PENDING_APPROVAL },
      include: { vendor: true, lineItems: true }
    });
    await writeAudit(req.user.id, "PO_SUBMITTED", "PurchaseOrder", po.id, { poNumber: po.poNumber, amount: po.totalAmount });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/approve", requireAuth, async (req, res, next) => {
  try {
    const { acknowledgeBreach } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { lineItems: true } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "approve", ctx ?? void 0);
    blockSelfApproval(req.user.id, po.requesterId);
    const poAmount = N(po.totalAmount);
    blockMakerChecker(req.user.id, po.requesterId);
    if (!canRoleApprove(req.user.role, poAmount)) {
      res.status(403).json({ error: "Your role cannot approve this amount" });
      return;
    }
    const impact = await buildBudgetImpact(po.lineItems, POStatus.PENDING_APPROVAL);
    const hasBreach = impact.some((b) => b.breach);
    if (hasBreach && !acknowledgeBreach) {
      res.status(400).json({ error: "Budget breach acknowledgment required", budgetBreach: true });
      return;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.APPROVED, approverId: req.user.id, approvedAt: /* @__PURE__ */ new Date() },
      include: { vendor: true, lineItems: true }
    });
    for (const li of po.lineItems) await recalcLineItem(li.lineItemId);
    await writeAudit(req.user.id, "PO_APPROVED", "PurchaseOrder", po.id, { poNumber: po.poNumber });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/reject", requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      res.status(400).json({ error: "Rejection reason is required" });
      return;
    }
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    blockSelfApproval(req.user.id, po.requesterId);
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.REJECTED, rejectReason: reason }
    });
    await writeAudit(req.user.id, "PO_REJECTED", "PurchaseOrder", po.id, { reason });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/return", requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.RETURNED, rejectReason: reason ?? "Returned for edit" }
    });
    await writeAudit(req.user.id, "PO_RETURNED", "PurchaseOrder", po.id, { reason });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/send", requireAuth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: "Only approved POs can be sent to vendor (FR-6.4 AC3)" });
      return;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: POStatus.SENT_TO_VENDOR }
    });
    await writeAudit(req.user.id, "PO_SENT_TO_VENDOR", "PurchaseOrder", po.id, { poNumber: po.poNumber });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router7.post("/:id/amend", requireAuth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { lineItems: true }
    });
    if (!po) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (po.status !== POStatus.APPROVED && po.status !== POStatus.SENT_TO_VENDOR) {
      res.status(400).json({ error: "Only approved POs can be amended (FR-6.5)" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { title, totalAmount, deliveryDate, paymentTerms, amendReason } = req.body;
    if (!amendReason?.trim()) {
      res.status(400).json({ error: "Amendment reason is required (FR-6.5)" });
      return;
    }
    const currentVersion = po.version ?? 1;
    try {
      await prisma.pOVersion.create({
        data: {
          purchaseOrderId: po.id,
          version: currentVersion,
          poNumber: po.poNumber,
          title: po.title,
          totalAmount: po.totalAmount,
          deliveryDate: po.deliveryDate,
          paymentTerms: po.paymentTerms,
          status: po.status,
          amendReason,
          snapshotAt: /* @__PURE__ */ new Date(),
          snapshotById: req.user.id
        }
      });
    } catch {
      await writeAudit(req.user.id, "PO_VERSION_SNAPSHOT", "PurchaseOrder", po.id, {
        version: currentVersion,
        amendReason,
        prevStatus: po.status,
        prevAmount: po.totalAmount?.toString()
      });
    }
    const amountChanged = totalAmount != null && BigInt(totalAmount) !== BigInt(po.totalAmount ?? 0);
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        ...title && { title },
        ...totalAmount != null && { totalAmount: BigInt(totalAmount) },
        ...deliveryDate && { deliveryDate: new Date(deliveryDate) },
        ...paymentTerms && { paymentTerms },
        // FR-6.5 AC2: if amount changes, requires re-approval
        status: amountChanged ? POStatus.DRAFT : POStatus.APPROVED,
        // Bump version counter
        version: currentVersion + 1
      },
      include: { vendor: true, lineItems: true }
    });
    await writeAudit(req.user.id, "PO_AMENDED", "PurchaseOrder", po.id, {
      poNumber: po.poNumber,
      newVersion: currentVersion + 1,
      amendReason,
      amountChanged
    });
    res.json({ ...updated, requiresReapproval: amountChanged });
  } catch (err) {
    next(err);
  }
});
var pos_default = router7;

// src/routes/payments.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const items = await prisma.paymentRequest.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { po: { include: { vendor: true } }, project: true, requester: true, approver: true, payment: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});
router8.post("/", requireAuth, async (req, res, next) => {
  try {
    const { poId, amount, purpose, lineItemId } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lineItems: true } });
    if (!po || po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: "PO must be approved" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const pr = await prisma.paymentRequest.create({
      data: {
        projectId: po.projectId,
        poId,
        amount,
        purpose,
        lineItemId: lineItemId ?? po.lineItems[0]?.lineItemId,
        requesterId: req.user.id,
        status: PaymentRequestStatus.DRAFT
      },
      include: { po: { include: { vendor: true, lineItems: true } } }
    });
    res.status(201).json(pr);
  } catch (err) {
    next(err);
  }
});
router8.post("/:id/submit", requireAuth, async (req, res, next) => {
  try {
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const updated = await prisma.paymentRequest.update({
      where: { id: pr.id },
      data: { status: PaymentRequestStatus.PENDING_APPROVAL }
    });
    await writeAudit(req.user.id, "PAYMENT_SUBMITTED", "PaymentRequest", pr.id, { amount: pr.amount });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router8.post("/:id/approve", requireAuth, async (req, res, next) => {
  try {
    const { acknowledgeBreach } = req.body;
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ctx = await getProjectContext(pr.projectId);
    assertCan(req.user, "approve", ctx ?? void 0);
    blockSelfApproval(req.user.id, pr.requesterId);
    const prAmount = N(pr.amount);
    blockMakerChecker(String(prAmount), req.user.id);
    if (!canRoleApprove(req.user.role, prAmount)) {
      res.status(403).json({ error: "Your role cannot approve this amount" });
      return;
    }
    if (pr.lineItemId) {
      const line = await prisma.wBSLineItem.findUnique({ where: { id: pr.lineItemId } });
      if (line && N(line.paid) + prAmount > N(line.estimated) && !acknowledgeBreach) {
        res.status(400).json({ error: "Budget breach acknowledgment required", budgetBreach: true });
        return;
      }
    }
    const updated = await prisma.paymentRequest.update({
      where: { id: pr.id },
      data: { status: PaymentRequestStatus.APPROVED, approverId: req.user.id, approvedAt: /* @__PURE__ */ new Date() }
    });
    await writeAudit(req.user.id, "PAYMENT_APPROVED", "PaymentRequest", pr.id, { amount: pr.amount });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router8.post("/:id/execute", requireAuth, async (req, res, next) => {
  try {
    const { utr } = req.body;
    const pr = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!pr || pr.status !== PaymentRequestStatus.APPROVED) {
      res.status(400).json({ error: "Payment must be approved first" });
      return;
    }
    const ctx = await getProjectContext(pr.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const payment = await prisma.payment.create({
      data: { paymentRequestId: pr.id, utr, paidAt: /* @__PURE__ */ new Date(), amount: pr.amount }
    });
    await prisma.paymentRequest.update({ where: { id: pr.id }, data: { status: PaymentRequestStatus.PAID } });
    if (pr.lineItemId) {
      await prisma.wBSLineItem.update({
        where: { id: pr.lineItemId },
        data: { paid: { increment: pr.amount } }
      });
      await recalcLineItem(pr.lineItemId);
    }
    await writeAudit(req.user.id, "PAYMENT_EXECUTED", "Payment", payment.id, { utr, amount: pr.amount });
    res.json({ payment, paymentRequest: pr });
  } catch (err) {
    next(err);
  }
});
var payments_default = router8;

// src/routes/invoices.ts
import { Router as Router9 } from "express";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
var router9 = Router9();
router9.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const invoices = await prisma.customerInvoice.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true },
      orderBy: { issuedAt: "desc" }
    });
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});
router9.post("/", requireAuth, async (req, res, next) => {
  try {
    const { projectId, type, amount, milestone, taxAmount } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const count = await prisma.customerInvoice.count();
    const prefix = type === InvoiceType.TAX ? "INV-TX" : "INV-PF";
    const invoiceNumber = `${prefix}-2026-${String(count + 1).padStart(3, "0")}`;
    const invoice = await prisma.customerInvoice.create({
      data: {
        projectId,
        type: type ?? InvoiceType.PROFORMA,
        amount,
        taxAmount: taxAmount ?? 0,
        milestone,
        invoiceNumber,
        status: InvoiceStatus.ISSUED,
        issuedAt: /* @__PURE__ */ new Date()
      },
      include: { project: true }
    });
    await writeAudit(req.user.id, "INVOICE_GENERATED", "CustomerInvoice", invoice.id, { invoiceNumber, amount });
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});
router9.get("/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { parent: true } } }
    });
    if (!invoice) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fmt = (n) => `\u20B9${n.toLocaleString("en-IN")}`;
    let y = 780;
    page.drawText("VIJAYANTH RENEWABLE ENERGY PROJECTS", { x: 50, y, size: 14, font: bold, color: rgb(0.075, 0.243, 0.133) });
    y -= 30;
    page.drawText(`${invoice.type} INVOICE`, { x: 50, y, size: 18, font: bold });
    y -= 25;
    page.drawText(`Invoice No: ${invoice.invoiceNumber}`, { x: 50, y, size: 11, font });
    y -= 18;
    page.drawText(`Date: ${invoice.issuedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, { x: 50, y, size: 11, font });
    y -= 30;
    page.drawText(`Project: ${invoice.project.name}`, { x: 50, y, size: 11, font });
    y -= 18;
    page.drawText(`Client: ${invoice.project.client ?? "VCPPL"}`, { x: 50, y, size: 11, font });
    y -= 18;
    if (invoice.milestone) {
      page.drawText(`Milestone: ${invoice.milestone}`, { x: 50, y, size: 11, font });
      y -= 18;
    }
    y -= 20;
    page.drawText(`Amount: ${fmt(N(invoice.amount))}`, { x: 50, y, size: 14, font: bold });
    if (N(invoice.taxAmount)) {
      y -= 18;
      page.drawText(`Tax: ${fmt(N(invoice.taxAmount))}`, { x: 50, y, size: 11, font });
      y -= 18;
      page.drawText(`Total: ${fmt(N(invoice.amount) + N(invoice.taxAmount))}`, { x: 50, y, size: 12, font: bold });
    }
    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    next(err);
  }
});
var invoices_default = router9;

// src/routes/receipts.ts
import { Router as Router10 } from "express";
var router10 = Router10();
router10.get("/receivables", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projects = await prisma.project.findMany({
      where: { ...pf },
      include: { customerReceipts: true, customerInvoices: true }
    });
    const today = /* @__PURE__ */ new Date();
    const data = projects.filter((p) => N(p.billable) > 0).map((p) => {
      const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
      const billable = N(p.billable);
      const balance = billable - received;
      const pct = billable > 0 ? Math.round(received / billable * 100) : 0;
      const ageing = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: balance };
      for (const inv of p.customerInvoices) {
        const days = Math.floor((today.getTime() - inv.issuedAt.getTime()) / 864e5);
        const amt = N(inv.amount);
        if (days <= 30) ageing.d0_30 += amt;
        else if (days <= 60) ageing.d31_60 += amt;
        else if (days <= 90) ageing.d61_90 += amt;
        else ageing.d90plus += amt;
      }
      return { projectId: p.id, name: p.name, billable, received, balance, pctCollected: pct, ageing };
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});
router10.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const receipts = await prisma.customerReceipt.findMany({
      where: { project: pf },
      include: { project: true },
      orderBy: { receivedAt: "desc" }
    });
    res.json(receipts);
  } catch (err) {
    next(err);
  }
});
router10.post("/", requireAuth, async (req, res, next) => {
  try {
    const { projectId, amount, receivedAt, reference } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const receipt = await prisma.customerReceipt.create({
      data: { projectId, amount, receivedAt: new Date(receivedAt), reference },
      include: { project: true }
    });
    await writeAudit(req.user.id, "RECEIPT_RECORDED", "CustomerReceipt", receipt.id, { amount });
    res.status(201).json(receipt);
  } catch (err) {
    next(err);
  }
});
var receipts_default = router10;

// src/routes/documents.ts
import { Router as Router11 } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
var uploadDir = path.resolve(process.cwd(), "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
var upload = multer({ storage });
var router11 = Router11();
router11.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const { projectId } = req.query;
    const docs = await prisma.document.findMany({
      where: { project: pf, ...projectId ? { projectId: String(projectId) } : {} },
      include: { project: true, uploadedBy: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});
router11.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    const { projectId, category } = req.body;
    if (!req.file) {
      res.status(400).json({ error: "No file" });
      return;
    }
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const doc = await prisma.document.create({
      data: {
        projectId,
        filename: req.file.originalname,
        filepath: req.file.filename,
        category,
        uploadedById: req.user.id
      },
      include: { uploadedBy: true }
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});
router11.get("/:id/download", requireAuth, async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const fp = path.join(uploadDir, doc.filepath);
    if (!fs.existsSync(fp)) {
      res.status(404).json({ error: "File missing" });
      return;
    }
    res.download(fp, doc.filename);
  } catch (err) {
    next(err);
  }
});
var documents_default = router11;

// src/routes/grn.ts
import { Router as Router12 } from "express";
var router12 = Router12();
router12.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const grns = await prisma.gRN.findMany({
      where: { po: { project: pf } },
      include: { po: { include: { vendor: true, project: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(grns);
  } catch (err) {
    next(err);
  }
});
router12.post("/", requireAuth, async (req, res, next) => {
  try {
    const { poId, grnNumber, receivedAt, notes, qualityPass, qualityRemark, quantityReceived } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || po.status !== POStatus.APPROVED) {
      res.status(400).json({ error: "PO must be approved before recording a GRN (FR-6.6)" });
      return;
    }
    if (qualityPass === false && (!qualityRemark || !qualityRemark.trim())) {
      res.status(400).json({ error: "Quality fail requires a remark (FR-6.6 AC2)" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const grn = await prisma.gRN.create({
      data: {
        poId,
        grnNumber,
        receivedAt: new Date(receivedAt),
        notes,
        // FR-6.6 AC2: quality check fields
        ...qualityPass !== void 0 && { qualityPass },
        ...qualityRemark !== void 0 && { qualityRemark },
        // FR-6.6 AC1: partial receipt — how much was received this GRN
        ...quantityReceived !== void 0 && { quantityReceived },
        ...req.user.id && { recordedById: req.user.id }
      },
      include: { po: { include: { vendor: true, project: true } } }
    });
    await writeAudit(req.user.id, "GRN_RECORDED", "GRN", grn.id, {
      poId,
      grnNumber,
      qualityPass: grn.qualityPass,
      qualityRemark: grn.qualityRemark,
      quantityReceived: grn.quantityReceived
    });
    res.status(201).json(grn);
  } catch (err) {
    next(err);
  }
});
var grn_default = router12;

// src/routes/vendor-invoices.ts
import { Router as Router13 } from "express";
var router13 = Router13();
router13.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const items = await prisma.vendorInvoice.findMany({
      where: {
        po: {
          project: projectId ? { ...pf, id: projectId } : pf
        }
      },
      include: { po: { include: { vendor: true, project: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});
router13.post("/", requireAuth, async (req, res, next) => {
  try {
    const { poId, invoiceNumber, amount, invoiceDate } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) {
      res.status(400).json({ error: "PO not found" });
      return;
    }
    const ctx = await getProjectContext(po.projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const inv = await prisma.vendorInvoice.create({
      data: { poId, invoiceNumber, amount, invoiceDate: new Date(invoiceDate) },
      include: { po: { include: { vendor: true, project: true } } }
    });
    res.status(201).json(inv);
  } catch (err) {
    next(err);
  }
});
var vendor_invoices_default = router13;

// src/routes/reports.ts
import { Router as Router14 } from "express";
import ExcelJS from "exceljs";
var router14 = Router14();
function parseDate(q, fallback) {
  if (!q) return fallback;
  const d = new Date(String(q));
  return isNaN(d.getTime()) ? fallback : d;
}
router14.get("/pl", requireAuth, async (req, res, next) => {
  try {
    assertCan(req.user, "reports:export");
    const from = parseDate(req.query.from, /* @__PURE__ */ new Date("2025-01-01"));
    const to = parseDate(req.query.to, /* @__PURE__ */ new Date());
    const pf = await projectFilter(req.user);
    const projects = await prisma.project.findMany({
      where: { ...pf, parentId: { not: null } },
      include: { wbsLineItems: true, customerReceipts: true }
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Project P&L");
    ws.columns = [
      { header: "Project", key: "name", width: 30 },
      { header: "Billable (\u20B9)", key: "billable", width: 18 },
      { header: "Net Cost (\u20B9)", key: "netCost", width: 18 },
      { header: "Paid (\u20B9)", key: "paid", width: 18 },
      { header: "Profit (\u20B9)", key: "profit", width: 18 },
      { header: "Received (\u20B9)", key: "received", width: 18 }
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of projects) {
      const paid = sumAmounts(p.wbsLineItems.map((l) => l.paid));
      const received = sumAmounts(
        p.customerReceipts.filter((r) => r.receivedAt >= from && r.receivedAt <= to).map((r) => r.amount)
      );
      ws.addRow({ name: p.name, billable: N(p.billable), netCost: N(p.netCost), paid, profit: N(p.profit), received });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=project-pl.xlsx");
    await wb.xlsx.write(res);
  } catch (err) {
    next(err);
  }
});
router14.get("/budget-variance", requireAuth, async (req, res, next) => {
  try {
    assertCan(req.user, "reports:export");
    const pf = await projectFilter(req.user);
    const items = await prisma.wBSLineItem.findMany({
      where: { project: pf },
      include: { category: true, project: true }
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Budget Variance");
    ws.columns = [
      { header: "Project", key: "project", width: 25 },
      { header: "Category", key: "category", width: 25 },
      { header: "Line Item", key: "desc", width: 35 },
      { header: "Estimated", key: "est", width: 15 },
      { header: "Committed", key: "com", width: 15 },
      { header: "Paid", key: "paid", width: 15 },
      { header: "Variance", key: "var", width: 15 }
    ];
    ws.getRow(1).font = { bold: true };
    for (const li of items) {
      ws.addRow({
        project: li.project.name,
        category: li.category.name,
        desc: li.description,
        est: N(li.estimated),
        com: N(li.committed),
        paid: N(li.paid),
        var: N(li.committed) - N(li.estimated)
      });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=budget-variance.xlsx");
    await wb.xlsx.write(res);
  } catch (err) {
    next(err);
  }
});
router14.get("/receivables-ageing", requireAuth, async (req, res, next) => {
  try {
    assertCan(req.user, "reports:export");
    const pf = await projectFilter(req.user);
    const projects = await prisma.project.findMany({
      where: { ...pf, parentId: { not: null } },
      include: { customerReceipts: true, customerInvoices: true }
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Receivables Ageing");
    ws.columns = [
      { header: "Project", key: "name", width: 30 },
      { header: "Billable", key: "billable", width: 15 },
      { header: "Received", key: "received", width: 15 },
      { header: "Balance", key: "balance", width: 15 },
      { header: "% Collected", key: "pct", width: 12 }
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of projects) {
      const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
      const billable = N(p.billable);
      ws.addRow({
        name: p.name,
        billable,
        received,
        balance: billable - received,
        pct: billable > 0 ? Math.round(received / billable * 100) : 0
      });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=receivables-ageing.xlsx");
    await wb.xlsx.write(res);
  } catch (err) {
    next(err);
  }
});
var reports_default = router14;

// src/routes/audit.ts
import { Router as Router15 } from "express";
var router15 = Router15();
router15.get("/", requireAuth, async (req, res, next) => {
  try {
    assertCan(req.user, "audit:read");
    const { from, to, userId, entityType, projectId } = req.query;
    const where = {};
    if (projectId) {
      where.OR = [
        { entityType: "Project", entityId: String(projectId) },
        { metadata: { contains: String(projectId) } }
      ];
    }
    if (userId) where.userId = String(userId);
    if (entityType) where.entityType = String(entityType);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) {
        const t = new Date(String(to));
        t.setHours(23, 59, 59, 999);
        where.createdAt.lte = t;
      }
    }
    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});
var audit_default = router15;

// src/routes/settings.ts
import { Router as Router16 } from "express";
import bcrypt2 from "bcrypt";
import { exec } from "child_process";
import path2 from "path";
var router16 = Router16();
router16.get("/users", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, sectorId: true, projectAssignments: true }
  });
  res.json(users);
});
router16.patch("/users/:id", requireAuth, async (req, res) => {
  assertCan(req.user, "users:create");
  const { name, email, role, sectorId, projectIds } = req.body;
  await prisma.projectAssignment.deleteMany({ where: { userId: req.params.id } });
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...name && { name },
      ...email && { email },
      ...role && { role },
      ...sectorId !== void 0 && { sectorId },
      ...projectIds?.length && {
        projectAssignments: { create: projectIds.map((pid) => ({ projectId: pid })) }
      }
    }
  });
  res.json(user);
});
router16.post("/users", requireAuth, async (req, res) => {
  assertCan(req.user, "users:create");
  const { email, name, role, password, sectorId, projectIds } = req.body;
  const hash = await bcrypt2.hash(password ?? "demo123", 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      password: hash,
      sectorId,
      projectAssignments: projectIds?.length ? { create: projectIds.map((pid) => ({ projectId: pid })) } : void 0
    }
  });
  res.status(201).json(user);
});
router16.get("/sectors", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  res.json(await prisma.sector.findMany());
});
router16.get("/templates", requireAuth, async (req, res) => {
  res.json(await prisma.template.findMany({ include: { sector: true } }));
});
router16.patch("/templates/:id", requireAuth, async (req, res) => {
  const { name, description, tasksJson } = req.body;
  const t = await prisma.template.update({
    where: { id: req.params.id },
    data: { name, description, tasksJson }
  });
  res.json(t);
});
router16.get("/thresholds", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  res.json(await prisma.approvalThreshold.findMany());
});
router16.patch("/thresholds/:role", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  const t = await prisma.approvalThreshold.update({
    where: { role: req.params.role },
    data: { ceiling: BigInt(req.body.ceiling) }
  });
  res.json(t);
});
router16.post("/templates", requireAuth, async (req, res) => {
  const { name, sectorId, description, tasksJson } = req.body;
  const t = await prisma.template.create({
    data: { name, sectorId, description, tasksJson: tasksJson ?? "[]" }
  });
  res.status(201).json(t);
});
router16.patch("/sectors/:id", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  const s = await prisma.sector.update({
    where: { id: req.params.id },
    data: { active: req.body.active, name: req.body.name }
  });
  res.json(s);
});
router16.get("/bank-accounts", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  res.json(await prisma.bankAccount.findMany());
});
router16.post("/reset-demo", requireAuth, async (req, res) => {
  assertCan(req.user, "settings:manage");
  const root = path2.resolve(process.cwd(), "..");
  exec("npm run db:reset", { cwd: root }, (err) => {
    if (err) res.status(500).json({ error: "Reset failed" });
    else res.json({ ok: true, message: "Demo data reset complete" });
  });
});
var settings_default = router16;

// src/routes/daily-status.ts
import { Router as Router17 } from "express";
var router17 = Router17();
router17.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = req.query.projectId;
    const items = await prisma.dailyStatus.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true, user: true },
      orderBy: { date: "desc" },
      take: 50
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});
router17.post("/", requireAuth, async (req, res, next) => {
  try {
    const { projectId, date, summary } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user, "create", ctx ?? void 0);
    const item = await prisma.dailyStatus.create({
      data: { projectId, userId: req.user.id, date: new Date(date), summary },
      include: { project: true, user: true }
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});
router17.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.dailyStatus.findUnique({
      where: { id },
      include: { project: true }
    });
    if (!existing) return res.status(404).json({ error: "Status not found" });
    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user, "update", ctx ?? void 0);
    const { date, summary, projectId } = req.body;
    const updated = await prisma.dailyStatus.update({
      where: { id },
      data: {
        ...date && { date: new Date(date) },
        ...summary && { summary },
        ...projectId && { projectId }
      },
      include: { project: true, user: true }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
router17.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.dailyStatus.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Status not found" });
    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user, "delete", ctx ?? void 0);
    await prisma.dailyStatus.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
var daily_status_default = router17;

// src/routes/approvals.ts
import { Router as Router18 } from "express";

// src/lib/query.ts
function projectIdFromQuery(query) {
  const v = query.projectId;
  return typeof v === "string" && v ? v : void 0;
}

// src/routes/approvals.ts
var router18 = Router18();
router18.get("/", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const projectId = projectIdFromQuery(req.query);
    const projectWhere = projectId ? { ...pf, id: projectId } : pf;
    const pendingPOs = await prisma.purchaseOrder.findMany({
      where: { status: POStatus.PENDING_APPROVAL, project: projectWhere },
      include: {
        vendor: true,
        project: true,
        requester: true,
        lineItems: { include: { lineItem: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    const pendingPayments = await prisma.paymentRequest.findMany({
      where: { status: PaymentRequestStatus.PENDING_APPROVAL, project: projectWhere },
      include: { po: { include: { vendor: true } }, project: true, requester: true },
      orderBy: { createdAt: "desc" }
    });
    const poEnriched = await Promise.all(pendingPOs.map(async (po) => {
      const budgetImpact = await Promise.all(po.lineItems.map(async (li) => {
        const line = await prisma.wBSLineItem.findUnique({ where: { id: li.lineItemId } });
        const committed = N(line?.committed);
        const estimated = N(line?.estimated);
        const liAmount = N(li.amount);
        const newCommitted = committed + liAmount;
        return {
          lineItemId: li.lineItemId,
          description: li.description,
          currentCommitted: committed,
          newCommitted,
          estimated,
          breach: newCommitted > estimated
        };
      }));
      return { type: "PO", id: po.id, poNumber: po.poNumber, amount: N(po.totalAmount), project: po.project, vendor: po.vendor, requester: po.requester, budgetImpact };
    }));
    const paymentEnriched = pendingPayments.map((pr) => ({
      type: "PAYMENT",
      id: pr.id,
      amount: N(pr.amount),
      project: pr.project,
      po: pr.po,
      requester: pr.requester,
      purpose: pr.purpose
    }));
    res.json({ items: [...poEnriched, ...paymentEnriched] });
  } catch (err) {
    next(err);
  }
});
var approvals_default = router18;

// src/routes/nav.ts
import { Router as Router19 } from "express";
var router19 = Router19();
router19.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const pf = await projectFilter(req.user);
    const scope = Object.keys(pf).length > 0 ? { project: pf } : {};
    const [pendingPOs, pendingPayments, delayedTasks] = await Promise.all([
      prisma.purchaseOrder.count({ where: { status: POStatus.PENDING_APPROVAL, ...scope } }),
      prisma.paymentRequest.count({ where: { status: PaymentRequestStatus.PENDING_APPROVAL, ...scope } }),
      prisma.task.count({ where: { isDelayed: true, ...scope } })
    ]);
    res.json({
      pendingApprovals: pendingPOs + pendingPayments,
      delayedTasks
    });
  } catch (err) {
    next(err);
  }
});
var nav_default = router19;

// src/index.ts
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
var uploadDir2 = path3.resolve(__dirname, "../../uploads");
if (!fs2.existsSync(uploadDir2)) fs2.mkdirSync(uploadDir2, { recursive: true });
BigInt.prototype.toJSON = function() {
  return Number(this);
};
var app = express();
var PORT = process.env.PORT || 3001;
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use("/uploads", express.static(uploadDir2));
app.use(session({
  secret: process.env.SESSION_SECRET || "demo-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: "none", maxAge: 24 * 60 * 60 * 1e3 }
}));
app.use(loadUser);
app.use("/api/auth", auth_default);
app.use("/api/dashboard", dashboard_default);
app.use("/api/projects", projects_default);
app.use("/api/tasks", tasks_default);
app.use("/api/vendors", vendors_default);
app.use("/api/quotations", quotations_default);
app.use("/api/pos", pos_default);
app.use("/api/payments", payments_default);
app.use("/api/invoices", invoices_default);
app.use("/api/receipts", receipts_default);
app.use("/api/documents", documents_default);
app.use("/api/grn", grn_default);
app.use("/api/vendor-invoices", vendor_invoices_default);
app.use("/api/reports", reports_default);
app.use("/api/audit", audit_default);
app.use("/api/settings", settings_default);
app.use("/api/daily-status", daily_status_default);
app.use("/api/approvals", approvals_default);
app.use("/api/nav", nav_default);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status ?? 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  if (!res.headersSent) res.status(status).json({ error: message });
});
var server = app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process or run: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  }
  throw err;
});
