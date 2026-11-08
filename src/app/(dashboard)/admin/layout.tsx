// The /admin screens are gated by permission in AppShell (users.read for Users and Medical Staff, catalogs.read for Master Data:
// src/lib/session/permissions.ts ROUTE_RULES), not by a role check here. This pass-through layout is safe to delete.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
