import { Link, useLocation } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { useProjectContext } from '@/context/ProjectContext';
import { StatusPill } from '@/components/design/StatusPill';

export function ProjectContextBanner() {
  const { activeProject } = useProjectContext();
  const location = useLocation();
  if (!activeProject || location.pathname.startsWith(`/projects/${activeProject.id}`)) return null;

  return (
    <div className="context-banner">
      <Folder className="w-3.5 h-3.5 shrink-0" />
      <span className="lbl">Project context</span>
      <span className="val">{activeProject.name}</span>
      {activeProject.status && <StatusPill status={activeProject.status} />}
      <Link to={`/projects/${activeProject.id}`} className="btn btn-link btn-sm ml-auto">
        Open hub →
      </Link>
    </div>
  );
}
