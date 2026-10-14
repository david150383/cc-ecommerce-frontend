import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Spinner } from "../components/ui";
import { isAdmin, useSession } from "./session";

/** Pages for signed-in users: anonymous visitors go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return <Spinner label="Checking your session…" />;
  if (status === "anonymous") return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

/** Hides admin pages from non-admins. The APIs enforce this regardless; this is only UX. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  if (status === "loading") return <Spinner label="Checking your session…" />;
  if (!isAdmin(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
