import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { UserWithScope } from '../lib/rbac.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthRequest extends Request {
  user?: UserWithScope;
}

export async function loadUser(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.userId) return next();
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    include: { projectAssignments: true },
  });
  if (user) {
    req.user = {
      ...user,
      projectIds: user.projectAssignments.map((a) => a.projectId),
    };
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
