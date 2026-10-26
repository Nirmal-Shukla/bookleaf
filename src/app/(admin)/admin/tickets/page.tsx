import { Suspense } from "react";

import {
  type AdminQueueQuery,
  AdminTicketFilters,
  AdminTicketQueue,
} from "@/components/admin/admin-ticket-queue";

export const metadata = { title: "Support queue" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function QueueFromSearch({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const query: AdminQueueQuery = {
    page: first(values.page),
    status: first(values.status),
    category: first(values.category),
    priority: first(values.priority),
    createdFrom: first(values.createdFrom),
    createdTo: first(values.createdTo),
  };
  return (
    <>
      <AdminTicketFilters query={query} />
      <AdminTicketQueue query={query} />
    </>
  );
}

export default function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <section className="max-w-7xl">
      <p className="text-sm font-semibold text-leaf">Support queue</p>
      <h1 className="mt-3 max-w-4xl font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Triage urgent work without losing the oldest requests.
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
        Filters use ticket creation time. Category and priority marked Unclassified have not been manually or automatically classified; General Inquiry is a deliberate category.
      </p>

      <Suspense fallback={<div className="mt-6 h-32 animate-pulse border border-rule bg-surface" />}>
        <QueueFromSearch searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

