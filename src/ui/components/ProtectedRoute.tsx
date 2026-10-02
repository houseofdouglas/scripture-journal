import { Navigate, useLocation } from "react-router-dom";
import { useAuth, loginUrl } from "../lib/auth-context";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Redirects unauthenticated visitors to `/login?return=<currentPath>`, adding
 * `&expired=1` only when a stored session existed and has expired.
 */
export function ProtectedRoute({ children }: Props) {
  const { user, sessionExpired } = useAuth();
  const location = useLocation();

  if (!user) {
    const returnPath = location.pathname + location.search;
    return <Navigate to={loginUrl(returnPath, { expired: sessionExpired })} replace />;
  }

  return <>{children}</>;
}
