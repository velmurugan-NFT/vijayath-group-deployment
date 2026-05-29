import { useProjectIdFromUrl, useProjectContext } from '@/context/ProjectContext';

export function useProjectQuery(): string {
  const projectId = useProjectIdFromUrl();
  const { activeProject } = useProjectContext();
  const id = activeProject?.id ?? projectId;
  return id ? `?projectId=${id}` : '';
}