import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';

import { AppLayout } from '@/components/layout/AppLayout';
import { GlobalLoader } from '@/components/GlobalLoader';

import { useLoading } from '@/context/LoadingContext';

import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { TasksPage } from '@/pages/TasksPage';
import { VendorsPage } from '@/pages/VendorsPage';
import { QuotationsPage } from '@/pages/QuotationsPage';
import { QuotationDetailPage } from '@/pages/QuotationDetailPage';
import { CaptureQuotesPage } from '@/pages/CaptureQuotesPage';
import { POPage } from '@/pages/POPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { InvoicesPage } from '@/pages/InvoicesPage';
import { ReceivablesPage } from '@/pages/ReceivablesPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AuditPage } from '@/pages/AuditPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { GrnPage } from '@/pages/GrnPage';
import { VendorInvoicesPage } from '@/pages/VendorInvoicesPage';
import { DailyStatusPage } from '@/pages/DailyStatusPage';

function PrivateRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return <>{children}</>;
}

function AppRoutes() {

  const { loading } = useLoading();

  return (
    <>
      {loading && <GlobalLoader />}

      <BrowserRouter>

        <Routes>

          <Route
            path="/login"
            element={<LoginPage />}
          />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >

            <Route
              index
              element={<DashboardPage />}
            />

            <Route
              path="approvals"
              element={<ApprovalsPage />}
            />

            <Route
              path="projects"
              element={<ProjectsPage />}
            />

            <Route
              path="projects/:id"
              element={<ProjectDetailPage />}
            />

            <Route
              path="tasks"
              element={<TasksPage />}
            />

            <Route
              path="daily-status"
              element={<DailyStatusPage />}
            />

            <Route
              path="vendors"
              element={<VendorsPage />}
            />

            <Route
              path="grn"
              element={<GrnPage />}
            />

            <Route
              path="vendor-invoices"
              element={<VendorInvoicesPage />}
            />

            <Route
              path="quotations"
              element={<QuotationsPage />}
            />

            <Route
              path="quotations/:id"
              element={<QuotationDetailPage />}
            />

            <Route
              path="capture-quotes"
              element={<CaptureQuotesPage />}
            />

            <Route
              path="pos/:id"
              element={<POPage />}
            />

            <Route
              path="payments"
              element={<PaymentsPage />}
            />

            <Route
              path="invoices"
              element={<InvoicesPage />}
            />

            <Route
              path="receivables"
              element={<ReceivablesPage />}
            />

            <Route
              path="documents"
              element={<DocumentsPage />}
            />

            <Route
              path="reports"
              element={<ReportsPage />}
            />

            <Route
              path="audit"
              element={<AuditPage />}
            />

            <Route
              path="settings"
              element={<SettingsPage />}
            />

          </Route>

        </Routes>

      </BrowserRouter>
    </>
  );
}

export default function App() {

  return (
    <AuthProvider>

      <AppRoutes />

    </AuthProvider>
  );
}