import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toaster } from 'sonner';
import { ProjectProvider } from '@/context/ProjectContext';
import { ProjectContextBanner } from '@/components/ProjectContextBanner';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ProjectProvider>
      <div className="app-shell">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <TopBar onMenuOpen={() => setMobileOpen(true)} />
        <main className="main-content">
          <div className="content-wrap">
            <ProjectContextBanner />
            <Outlet />
          </div>
        </main>
        <Toaster position="top-right" richColors />
      </div>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </ProjectProvider>
  );
}
