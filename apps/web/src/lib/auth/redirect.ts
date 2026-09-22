import type { UserRole } from "./AuthContext";

// Where each role lands by default: super admins on the admin dashboard,
// support agents in their inbox, everyone else on their own dashboard.
export function homeFor(role: UserRole | undefined): string {
  if (role === "superadmin") return "/admin";
  if (role === "support") return "/admin/support";
  return "/dashboard";
}

// Where to go after signing in or up: the page's ?next= when it's a path on
// this site (never another origin, so the link can't bounce people off-site),
// otherwise the role's home.
export function postAuthDestination(role?: UserRole): string {
  const home = homeFor(role);
  if (typeof window === "undefined") return home;
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return home;
}
