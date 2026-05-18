export type Role = 'SUPER_ADMIN' | 'CORPORATE_OFFICE' | 'SECTOR_HEAD' | 'PROJECT_HEAD';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  sectorId?: string | null;
  projectIds?: string[];
}
