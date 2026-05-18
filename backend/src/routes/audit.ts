import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  assertCan(req.user!, 'audit:read');
  const { from, to, userId, entityType, projectId } = req.query;
  const where: Record<string, unknown> = {};
  if (projectId) {
    where.OR = [
      { entityType: 'Project', entityId: String(projectId) },
      { metadata: { contains: String(projectId) } },
    ];
  }
  if (userId) where.userId = String(userId);
  if (entityType) where.entityType = String(entityType);
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(String(from));
    if (to) {
      const t = new Date(String(to));
      t.setHours(23, 59, 59, 999);
      (where.createdAt as Record<string, Date>).lte = t;
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(logs);
});

export default router;
