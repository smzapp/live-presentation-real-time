// Where to go after signing in or up: the page's ?next= when it's a path on
// this site (never another origin, so the link can't bounce people off-site),
// otherwise the dashboard.
export function postAuthDestination(): string {
  if (typeof window === "undefined") return "/dashboard";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/dashboard";
}
