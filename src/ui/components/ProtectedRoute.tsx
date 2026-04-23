import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Redirects unauthenticated visitors to `/login?return=<currentPath>`.
 */
export function ProtectedRoute({ children }: Props) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const returnPath = location.pathname + location.search;
    return <Navigate to={`/login?return=${encodeURIComponent(returnPath)}`} replace />;
  }

  return <>{children}</>;
}
