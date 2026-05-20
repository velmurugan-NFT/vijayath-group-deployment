import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';

export interface ProjectSummary {
  id: string;
  name: string;
  parentId?: string | null;
  status?: string;
}

interface ProjectCtx {
  projects: ProjectSummary[];       // all accessible sub-projects
  activeProject: ProjectSummary | null;
  setActiveProjectId: (id: string | null) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectCtx | null>(null);
const STORAGE_KEY = 'vijayanth_active_project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading]   = useState(true);

  // Track whether we've already synced the URL param → sessionStorage on this page load
  const synced = useRef(false);

  const urlProjectId = searchParams.get('projectId');

  // On first render, if URL carries a projectId, commit it to sessionStorage immediately
  // so activeId is stable before the async projects list arrives.
  if (!synced.current && urlProjectId) {
    sessionStorage.setItem(STORAGE_KEY, urlProjectId);
    synced.current = true;
  }

  const storedId = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
  // URL param wins over stored; stored wins over nothing
  const activeId = urlProjectId || storedId;

  useEffect(() => {
    api<ProjectSummary[]>('/projects')
      .then((list) => {
        // Include ALL projects (parents + sub-projects) so links from project detail pages
        // always resolve — the detail page passes its own id which may be a parent.
        setProjects(list);
      })
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
