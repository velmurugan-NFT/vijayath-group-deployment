import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';

export interface ProjectSummary {
  id: string;
  name: string;
  parentId?: string | null;
  status?: string;
}

interface ProjectCtx {
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  setActiveProjectId: (id: string | null) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectCtx | null>(null);
const STORAGE_KEY = 'vijayanth_active_project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const urlProjectId = searchParams.get('projectId');
  const storedId = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
  const activeId = urlProjectId || storedId;

  useEffect(() => {
    api<ProjectSummary[]>('/projects')
      .then((list) => setProjects(list.filter((p) => p.parentId)))
      .finally(() => setLoading(false));
  }, []);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  const setActiveProjectId = (id: string | null) => {
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id);
      const next = new URLSearchParams(searchParams);
      next.set('projectId', id);
      setSearchParams(next, { replace: true });
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      const next = new URLSearchParams(searchParams);
      next.delete('projectId');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProjectId, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext outside provider');
  return ctx;
}

export function useProjectIdFromUrl(): string | null {
  const [params] = useSearchParams();
  return params.get('projectId') || sessionStorage.getItem(STORAGE_KEY);
}
