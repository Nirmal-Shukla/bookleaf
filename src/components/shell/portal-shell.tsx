import Link from "next/link";
import type { ReactNode } from "react";

import { UserRole } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/server/auth/authorization";

import { LogoutButton } from "../auth/logout-button";
import {
  type PortalNavigationItem,
  PortalNavigation,
} from "./portal-navigation";

export function PortalShell({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: ReactNode;
}) {
  const isAdmin = user.role === UserRole.ADMIN;
  const homePath = isAdmin ? "/admin" : "/author";
  const areaLabel = isAdmin ? "Operations" : "Author workspace";
  const navigationItems: PortalNavigationItem[] = isAdmin
    ? [
        { href: "/admin", label: "Home", exact: true },
        { href: "/admin/tickets", label: "Support queue" },
      ]
    : [
        { href: "/author", label: "Overview", exact: true },
        { href: "/author/books", label: "My books" },
        { href: "/author/tickets", label: "My tickets" },
      ];

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex min-h-18 max-w-[90rem] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Link
            className="font-serif text-2xl font-semibold tracking-[-0.025em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
            href={homePath}
          >
            BookLeaf
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink-soft">{user.name}</p>
              <p className="text-xs text-muted">{areaLabel}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[90rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b border-rule bg-surface px-5 py-4 sm:px-8 lg:min-h-[calc(100dvh-4.5rem)] lg:border-r lg:border-b-0 lg:px-6 lg:py-8">
          <PortalNavigation label={areaLabel} items={navigationItems} />
        </aside>

        <main id="main-content" className="min-w-0 px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
          {children}
        </main>
      </div>
    </div>
  );
}
