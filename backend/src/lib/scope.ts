import { Role } from './constants.js';
import { prisma } from './prisma.js';
import { UserWithScope } from './rbac.js';



export async function getAccessibleProjectIds(user: UserWithScope): Promise<string[] | 'all'> {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.CORPORATE_OFFICE) return 'all';

  if (user.role === Role.SECTOR_HEAD && user.sectorId) {
    const projects = await prisma.project.findMany({
      where: { sectorId: user.sectorId },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  // PROJECT_HEAD (and any other role): start from directly assigned IDs
  const directIds: string[] = (user as any).projectIds ?? [];
  if (directIds.length === 0) return [];

  // Fetch those projects to check if any are parents or sub-projects
  const directProjects = await prisma.project.findMany({
    where: { id: { in: directIds } },
    select: { id: true, parentId: true },
  });

  const allIds = new Set<string>(directIds);

  // For each assigned project that IS a parent (parentId === null),
  // also include all its sub-projects so they appear in scoped views.
  const parentIds = directProjects.filter((p) => p.parentId === null).map((p) => p.id);
  if (parentIds.length > 0) {
    const subs = await prisma.project.findMany({
      where: { parentId: { in: parentIds } },
      select: { id: true },
    });
    subs.forEach((s) => allIds.add(s.id));
  }

  // For each assigned sub-project, also include its parent project so
  // parent-level pages (dashboard, receivables) can surface it.
  const subParentIds = directProjects
    .filter((p) => p.parentId !== null)
    .map((p) => p.parentId as string);
  subParentIds.forEach((pid) => allIds.add(pid));

  return Array.from(allIds);
}

export async function projectFilter(
  user: UserWithScope,
): Promise<{ sectorId?: string; id?: { in: string[] } } | Record<string, never>> {
  const ids = await getAccessibleProjectIds(user);
  if (ids === 'all') return {};
  if (user.role === Role.SECTOR_HEAD && user.sectorId) return { sectorId: user.sectorId };
  return { id: { in: ids } };
}

export async function getProjectContext(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { sector: true },
  });
  return p ? { sectorId: p.sectorId, projectId: p.id } : null;
}
