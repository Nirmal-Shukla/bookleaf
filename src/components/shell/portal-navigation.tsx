"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalNavigationItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export function PortalNavigation({
  label,
  items,
}: {
  label: string;
  items: PortalNavigationItem[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={`${label} navigation`}>
      <p className="mb-2 px-3 text-sm font-semibold text-ink-soft">{label}</p>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {items.map((item) => {
          const isCurrent = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 ${
                  isCurrent
                    ? "border-leaf/20 bg-leaf-pale text-leaf"
                    : "border-transparent text-muted hover:border-rule hover:bg-canvas hover:text-ink-soft"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
