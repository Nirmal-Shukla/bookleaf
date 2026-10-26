import Link from "next/link";
import { Suspense } from "react";

import { TicketsDashboard } from "@/components/tickets/tickets-dashboard";

export const metadata = { title: "My tickets" };

function validPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function TicketList({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = validPage((await searchParams).page);
  return <TicketsDashboard page={page} />;
}

export default function AuthorTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return (
    <section className="max-w-6xl">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-leaf">My tickets</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
            Support requests and responses in one place.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            Open a ticket to review your original query, current status, and every public response from BookLeaf.
          </p>
        </div>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2" href="/author/tickets/new">
          Create a ticket
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-28 animate-pulse rounded-lg border border-rule bg-surface" />}>
        <TicketList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

