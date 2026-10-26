import type { ReactNode } from "react";

import { PortalShell } from "@/components/shell/portal-shell";
import { UserRole } from "@/generated/prisma/client";
import { requirePageRole } from "@/server/auth/page-authorization";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageRole(UserRole.ADMIN);
  return <PortalShell user={user}>{children}</PortalShell>;
}
