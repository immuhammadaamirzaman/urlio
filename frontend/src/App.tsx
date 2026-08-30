import { lazy } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { ConfirmEmailChangePage } from "./pages/ConfirmEmailChangePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

/*
 * Split point. Everything above is the anonymous entry path — the landing page, the auth
 * forms, and the pages people reach from an email link — so it stays in the entry chunk
 * where an extra round trip would be felt.
 *
 * Everything below is signed-in or admin-only surface that most visitors never open, and
 * it carries the bulk of the weight (tables, the chart, the credential forms). Loading it
 * on navigation instead of on first paint is the difference between shipping the whole app
 * to someone who only wants to shorten one URL and shipping them the shortener.
 *
 * These are named exports, hence the `.then` mapping — `lazy` resolves a default export.
 * `Layout` renders the Suspense boundary, so the shell stays put while a chunk arrives.
 */
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const LinkDetailPage = lazy(() =>
  import("./pages/LinkDetailPage").then((m) => ({ default: m.LinkDetailPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const CredentialsPage = lazy(() =>
  import("./pages/CredentialsPage").then((m) => ({ default: m.CredentialsPage })),
);
const SecretsPage = lazy(() =>
  import("./pages/SecretsPage").then((m) => ({ default: m.SecretsPage })),
);
const AdminPage = lazy(() =>
  import("./pages/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);

/** Redirect already-authenticated users away from the auth pages. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  if (initializing) return null;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

/** Superuser-only routes: sign-in required, then an is_superuser check. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return null;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return user?.is_superuser ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route
          path="forgot-password"
          element={
            <GuestOnly>
              <ForgotPasswordPage />
            </GuestOnly>
          }
        />
        {/* Token pages work signed-in or signed-out (links arrive by email). */}
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="confirm-email-change" element={<ConfirmEmailChangePage />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="dashboard/links/:id"
          element={
            <ProtectedRoute>
              <LinkDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="secrets" element={<SecretsPage />} />
        <Route path="secrets/:token" element={<SecretsPage />} />
        <Route
          path="credentials"
          element={
            <ProtectedRoute>
              <CredentialsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminOnly>
              <AdminPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
