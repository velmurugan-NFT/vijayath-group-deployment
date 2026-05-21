import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

// ─── helpers ────────────────────────────────────────────────────────────────
function readStored(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(id: string | null) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ─── Provider ───────────────────────────────────────────────────────────────
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading,  setLoading]  = useState(true);
  // activeId is the single source of truth — null means "All projects"
  const [activeId, setActiveIdState] = useState<string | null>(() => readStored());

  useEffect(() => {
    api<ProjectSummary[]>('/projects')
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  const setActiveProjectId = (id: string | null) => {
    writeStored(id);
    setActiveIdState(id);
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProjectId, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

// ─── hooks ──────────────────────────────────────────────────────────────────
export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext outside provider');
  return ctx;
}

/** Returns the currently active project id (from context state, not URL). */
export function useProjectIdFromUrl(): string | null {
  // Name kept for backwards compatibility with existing callers.
  // Now simply reads from context instead of URL params.
  return readStored();
}
