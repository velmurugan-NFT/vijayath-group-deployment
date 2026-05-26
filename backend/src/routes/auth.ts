import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { projectAssignments: true },
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  req.session.userId = user.id;
  res.json({
    
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sectorId: user.sectorId,
    projectIds: user.projectAssignments.map((a) => a.projectId),
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const u = req.user!;
  res.json({
    id: u.id, email: (u as any).email, name: (u as any).name, role: u.role,
    sectorId: u.sectorId, projectIds: (u as any).projectIds,
  });
});

router.get('/demo-users', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { role: 'asc' },
  });
  res.json(users);
});

router.post('/demo-switch', requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.body;
  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { projectAssignments: true },
  });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  req.session.userId = target.id;
  req.session.save(() => {
    res.json({
      id: target.id, email: target.email, name: target.name, role: target.role,
      sectorId: target.sectorId, projectIds: target.projectAssignments.map((a) => a.projectId),
    });
  });
});

export default router;