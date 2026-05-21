import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext } from '../lib/scope.js';
import { projectFilter } from '../lib/scope.js';
import { writeAudit } from '../lib/audit.js';
import { TaskStatus } from '../lib/constants.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const { projectId, department, status } = req.query;
    const tasks = await prisma.task.findMany({
      where: {
        project: pf,
        ...(projectId ? { projectId: String(projectId) } : {}),
        ...(department ? { department: String(department) } : {}),
        ...(status ? { status: String(status) } : {}),
      },
      include: { project: true },
      orderBy: [{ department: 'asc' }, { plannedEnd: 'asc' }],
    });
    res.json(tasks);
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!task) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(task.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const { status, remarks, title, department, plannedEnd, plannedStart } = req.body;
    const today = new Date();
    const resolvedStatus = status ?? task.status;
    const resolvedPlannedEnd = plannedEnd ? new Date(plannedEnd) : task.plannedEnd;
    const isDelayed = resolvedPlannedEnd && resolvedPlannedEnd < today && resolvedStatus === TaskStatus.IN_PROGRESS;

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(title != null && { title }),
        ...(department != null && { department }),
        ...(plannedStart != null && { plannedStart: new Date(plannedStart) }),
        ...(plannedEnd != null && { plannedEnd: new Date(plannedEnd) }),
        status: resolvedStatus,
        remarks: remarks ?? task.remarks,
        isDelayed: isDelayed ?? task.isDelayed,
        updatedById: req.user!.id,
        actualStart: resolvedStatus === TaskStatus.IN_PROGRESS && !task.actualStart ? today : task.actualStart,
        actualEnd: resolvedStatus === TaskStatus.COMPLETED ? today : task.actualEnd,
      },
    });

    await writeAudit(req.user!.id, 'TASK_UPDATED', 'Task', task.id, { title: task.title, status });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) { res.status(404).json({ error: 'Not found' }); return; }
    const ctx = await getProjectContext(task.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);
    await writeAudit(req.user!.id, 'TASK_DELETED', 'Task', task.id, { title: task.title });
    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, title, department, status, plannedStart, plannedEnd, remarks } = req.body;

    if (!projectId) { res.status(400).json({ error: 'projectId is required' }); return; }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(400).json({ error: `Project with id "${projectId}" does not exist` }); return; }

    const ctx = await getProjectContext(projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const task = await prisma.task.create({
      data: {
        projectId, title, department,
        status: status ?? TaskStatus.NOT_STARTED,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        remarks,
      },
      include: { project: true },
    });
    await writeAudit(req.user!.id, 'TASK_CREATED', 'Task', task.id, { title });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

export default router;
