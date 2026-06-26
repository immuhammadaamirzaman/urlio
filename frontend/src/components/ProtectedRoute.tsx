import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "../context/AuthContext";
import { PageLoader } from "./Spinner";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <PageLoader label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
