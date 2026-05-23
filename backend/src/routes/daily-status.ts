import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';

const router = Router();

// ── GET /daily-status ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const projectId = req.query.projectId as string | undefined;
    const items = await prisma.dailyStatus.findMany({
      where: { project: projectId ? { ...pf, id: projectId } : pf },
      include: { project: true, user: true },
      orderBy: { date: 'desc' },
      take: 50,
    });
    res.json(items);
  } catch (err) { next(err); }
});

// ── POST /daily-status ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, date, summary } = req.body;
    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);
    const item = await prisma.dailyStatus.create({
      data: { projectId, userId: req.user!.id, date: new Date(date), summary },
      include: { project: true, user: true },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// ── PATCH /daily-status/:id ───────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Fetch the existing record to verify ownership / scope
    const existing = await prisma.dailyStatus.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing) return res.status(404).json({ error: 'Status not found' });

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { date, summary, projectId } = req.body;

    const updated = await prisma.dailyStatus.update({
      where: { id },
      data: {
        ...(date      && { date: new Date(date) }),
        ...(summary   && { summary }),
        ...(projectId && { projectId }),
      },
      include: { project: true, user: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── DELETE /daily-status/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Fetch existing to verify scope before deleting
    const existing = await prisma.dailyStatus.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Status not found' });

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'delete', ctx ?? undefined);

    await prisma.dailyStatus.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;