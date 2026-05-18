import { Role } from './constants.js';
import { prisma } from './prisma.js';
import { UserWithScope } from './rbac.js';

export async function getAccessibleProjectIds(user: UserWithScope): Promise<string[] | 'all'> {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.CORPORATE_OFFICE) return 'all';
  if (user.role === Role.SECTOR_HEAD && user.sectorId) {
    const projects = await prisma.project.findMany({ where: { sectorId: user.sectorId }, select: { id: true } });
    return projects.map((p) => p.id);
  }
  return user.projectIds ?? [];
}

export async function projectFilter(user: UserWithScope): Promise<{ sectorId?: string; id?: { in: string[] } } | Record<string, never>> {
  const ids = await getAccessibleProjectIds(user);
  if (ids === 'all') return {};
  if (user.role === Role.SECTOR_HEAD && user.sectorId) return { sectorId: user.sectorId };
  return { id: { in: ids } };
}

export async function getProjectContext(projectId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, include: { sector: true } });
  return p ? { sectorId: p.sectorId, projectId: p.id } : null;
}
