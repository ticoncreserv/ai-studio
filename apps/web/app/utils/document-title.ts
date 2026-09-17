export type DocumentTitleKind = "home" | "studio" | "admin";

export function documentTitleKind(path: string): DocumentTitleKind {
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path.startsWith("/w/")) return "studio";
  return "home";
}
