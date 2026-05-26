import { prisma } from '../lib/prisma.js';
export async function loadUser(req, _res, next) {
    if (!req.session?.userId)
        return next();
    const user = await prisma.user.findUnique({
        where: { id: req.session.userId },
        include: { projectAssignments: true },
    });
    if (user) {
        req.user = {
            ...user,
            projectIds: user.projectAssignments?.map((a) => a.projectId) ?? [],
        };
        next();
    }
}
export function requireAuth(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}
