import { Router } from 'express';
import bcrypt from 'bcrypt';
import { exec } from 'child_process';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { Role } from '../lib/constants.js';
import { DEFAULT_APPROVAL_LIMIT } from '../lib/approvals.js';

const router = Router();

router.get('/users', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, sectorId: true,
      approvalLimit: true, projectAssignments: true,
    },
  });
  res.json(users.map((u) => ({ ...u, approvalLimit: Number(u.approvalLimit) })));
});

router.patch('/users/:id', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'users:create');
  const { name, email, role, sectorId, projectIds, approvalLimit } = req.body;
  await prisma.projectAssignment.deleteMany({ where: { userId: req.params.id } });
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(role && { role: role as Role }),
      ...(sectorId !== undefined && { sectorId }),
      ...(approvalLimit !== undefined && { approvalLimit: BigInt(approvalLimit) }),
      ...(projectIds?.length && {
        projectAssignments: { create: projectIds.map((pid: string) => ({ projectId: pid })) },
      }),
    },
  });
  res.json({ ...user, approvalLimit: Number(user.approvalLimit) });
});

router.post('/users', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'users:create');
  const { email, name, role, password, sectorId, projectIds, approvalLimit } = req.body;
  const hash = await bcrypt.hash(password ?? 'demo123', 10);
  const user = await prisma.user.create({
    data: {
      email, name, role: role as Role, password: hash, sectorId,
      approvalLimit: BigInt(approvalLimit ?? DEFAULT_APPROVAL_LIMIT),
      projectAssignments: projectIds?.length
        ? { create: projectIds.map((pid: string) => ({ projectId: pid })) }
        : undefined,
    },
  });
  res.status(201).json({ ...user, approvalLimit: Number(user.approvalLimit) });
});

router.get('/sectors', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  res.json(await prisma.sector.findMany());
});

router.get('/templates', requireAuth, async (req: AuthRequest, res) => {
  res.json(await prisma.template.findMany({ include: { sector: true } }));
});

router.patch('/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  const { name, description, tasksJson } = req.body;
  const t = await prisma.template.update({
    where: { id: req.params.id },
    data: { name, description, tasksJson },
  });
  res.json(t);
});

router.get('/thresholds', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  res.json(await prisma.approvalThreshold.findMany());
});

router.patch('/thresholds/:role', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  const t = await prisma.approvalThreshold.update({
    where: { role: req.params.role as Role },
    data: { ceiling: BigInt(req.body.ceiling) },
  });
  res.json(t);
});

router.post('/templates', requireAuth, async (req: AuthRequest, res) => {
  const { name, sectorId, description, tasksJson } = req.body;
  const t = await prisma.template.create({
    data: { name, sectorId, description, tasksJson: tasksJson ?? '[]' },
  });
  res.status(201).json(t);
});

router.patch('/sectors/:id', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  const s = await prisma.sector.update({
    where: { id: req.params.id },
    data: { active: req.body.active, name: req.body.name },
  });
  res.json(s);
});

router.get('/bank-accounts', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  res.json(await prisma.bankAccount.findMany());
});

router.post('/reset-demo', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'settings:manage');
  const root = path.resolve(process.cwd(), '..');
  exec('npm run db:reset', { cwd: root }, (err) => {
    if (err) res.status(500).json({ error: 'Reset failed' });
    else res.json({ ok: true, message: 'Demo data reset complete' });
  });
});

export default router;
