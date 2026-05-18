import { useProjectIdFromUrl } from '@/context/ProjectContext';

export function useProjectQuery(): string {
  const projectId = useProjectIdFromUrl();
  return projectId ? `?projectId=${projectId}` : '';
}
