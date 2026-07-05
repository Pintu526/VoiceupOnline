export function getPublicCampaignSlug(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/^\/c\/([^/]+)\/?$/)?.[1] ?? "";
}

export function getCampaignAdminSlug(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/^\/admin\/([^/]+)\/?$/)?.[1] ?? "";
}

export function getIsSaasAdminRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/admin" || window.location.pathname === "/admin/";
}

export function getIsAppRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
}

export function getLegalPage(): "privacy" | "terms" | "refund" | "data-deletion" | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/^\//, "");
  if (
    path === "privacy" ||
    path === "terms" ||
    path === "refund" ||
    path === "data-deletion"
  ) {
    return path as "privacy" | "terms" | "refund" | "data-deletion";
  }
  return null;
}

export function getIsLandingPageRoute(): boolean {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname;
  return pathname === "/" || pathname === "";
}
