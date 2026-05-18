import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const pf = await projectFilter(req.user!);
  const projectId = req.query.projectId as string | undefined;
  const items = await prisma.dailyStatus.findMany({
    where: { project: projectId ? { ...pf, id: projectId } : pf },
    include: { project: true, user: true },
    orderBy: { date: 'desc' },
    take: 50,
  });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { projectId, date, summary } = req.body;
  const ctx = await getProjectContext(projectId);
  assertCan(req.user!, 'create', ctx ?? undefined);
  const item = await prisma.dailyStatus.create({
    data: { projectId, userId: req.user!.id, date: new Date(date), summary },
    include: { project: true, user: true },
  });
  res.status(201).json(item);
});

export default router;
