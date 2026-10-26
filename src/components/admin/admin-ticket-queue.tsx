"use client";

import Link from "next/link";

import { usePollingJson } from "@/components/shared/use-polling-json";
import type { AdminTicketsData } from "@/types/admin-tickets";

import {
  AdminCategoryBadge,
  AdminClassificationBadge,
  AdminPriorityBadge,
  AdminStatusBadge,
} from "./admin-ticket-badges";

export type AdminQueueQuery = {
  page?: string;
  status?: string;
  category?: string;
  priority?: string;
  createdFrom?: string;
  createdTo?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function isAdminTicketsData(value: unknown): value is AdminTicketsData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdminTicketsData>;
  return Array.isArray(candidate.tickets) && Boolean(candidate.pagination);
}

function queryString(query: AdminQueueQuery, page?: number) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== "page" && value) values.set(key, value);
  }
  values.set("page", String(page ?? Number(query.page || "1")));
  values.set("pageSize", "20");
  return values.toString();
}

function ageLabel(createdAt: string) {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).valueOf());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) return `${hours}h old`;
  const days = Math.floor(hours / 24);
  return `${days}d old`;
}

function QueueLoading() {
  return (
    <div className="mt-6 space-y-3" aria-label="Loading support queue" aria-busy="true">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-32 animate-pulse border border-rule bg-surface" />
      ))}
    </div>
  );
}

export function AdminTicketFilters({ query }: { query: AdminQueueQuery }) {
  return (
    <form className="mt-8 grid gap-4 border-y border-rule bg-surface px-5 py-6 sm:grid-cols-2 sm:px-7 lg:grid-cols-6" action="/admin/tickets" method="get">
      <label className="text-sm font-semibold text-ink">Status
        <select className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base font-normal" name="status" defaultValue={query.status ?? ""}>
          <option value="">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option>
        </select>
      </label>
      <label className="text-sm font-semibold text-ink">Category
        <select className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base font-normal" name="category" defaultValue={query.category ?? ""}>
          <option value="">All categories</option><option value="UNCLASSIFIED">Unclassified</option><option value="ROYALTY_PAYMENTS">Royalty &amp; Payments</option><option value="ISBN_METADATA_ISSUES">ISBN &amp; Metadata Issues</option><option value="PRINTING_QUALITY">Printing &amp; Quality</option><option value="DISTRIBUTION_AVAILABILITY">Distribution &amp; Availability</option><option value="BOOK_STATUS_PRODUCTION_UPDATES">Book Status &amp; Production Updates</option><option value="GENERAL_INQUIRY">General Inquiry</option>
        </select>
      </label>
      <label className="text-sm font-semibold text-ink">Priority
        <select className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base font-normal" name="priority" defaultValue={query.priority ?? ""}>
          <option value="">All priorities</option><option value="UNCLASSIFIED">Unclassified</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
        </select>
      </label>
      <label className="text-sm font-semibold text-ink">Created from <span className="font-normal text-muted">(UTC)</span>
        <input className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base font-normal" name="createdFrom" type="date" defaultValue={query.createdFrom ?? ""} />
      </label>
      <label className="text-sm font-semibold text-ink">Created to <span className="font-normal text-muted">(UTC)</span>
        <input className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base font-normal" name="createdTo" type="date" defaultValue={query.createdTo ?? ""} />
      </label>
      <div className="flex items-end gap-2">
        <button className="min-h-11 flex-1 cursor-pointer rounded-lg bg-leaf px-4 text-sm font-semibold text-white" type="submit">Apply filters</button>
        <Link className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted underline-offset-4 hover:underline" href="/admin/tickets">Clear</Link>
      </div>
      <p className="text-sm leading-6 text-muted sm:col-span-2 lg:col-span-6">
        UTC boundaries are inclusive by calendar day: From begins at 00:00 UTC, and To includes the entire selected day up to but not including 00:00 UTC the next day.
      </p>
    </form>
  );
}

export function AdminTicketQueue({ query }: { query: AdminQueueQuery }) {
  const apiQuery = queryString(query);
  const { state, refresh } = usePollingJson(
    `/api/admin/tickets?${apiQuery}`,
    isAdminTicketsData,
  );

  if (state.initialLoading) return <QueueLoading />;
  if (state.error) {
    return (
      <div className="mt-6 border-y border-rule bg-surface px-5 py-9" role="alert">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {state.error.status === 401
            ? "Your session has expired."
            : "The support queue could not be loaded."}
        </h2>
        <button className="mt-5 min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white" type="button" onClick={() => void refresh(true)}>
          Try again
        </button>
      </div>
    );
  }

  const data = state.data!;
  return (
    <div className="mt-6">
      {state.refreshFailed ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-pale px-4 py-3 text-sm text-ink-soft" role="status">
          <span>Live queue updates are temporarily unavailable. Existing results remain visible.</span>
          <button className="min-h-9 cursor-pointer font-semibold text-leaf underline-offset-4 hover:underline" type="button" onClick={() => void refresh(false)}>Try now</button>
        </div>
      ) : null}

      {data.oldestUnresolved ? (
        <aside className="mb-4 border-l-4 border-warning bg-warning-pale px-4 py-3" aria-label="Oldest unresolved ticket">
          <p className="text-sm font-semibold text-warning">Oldest unresolved in this filter</p>
          <Link className="mt-1 block break-words text-sm font-semibold text-ink underline-offset-4 hover:underline" href={`/admin/tickets/${data.oldestUnresolved.id}`}>
            {data.oldestUnresolved.subject} · {ageLabel(data.oldestUnresolved.createdAt)}
          </Link>
        </aside>
      ) : null}

      <div className="flex flex-col gap-2 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
          {data.pagination.totalItems.toLocaleString("en-IN")} {data.pagination.totalItems === 1 ? "ticket" : "tickets"}
        </p>
        <p className="max-w-3xl text-sm leading-6 text-muted">{data.sort.description}</p>
      </div>

      {data.tickets.length === 0 ? (
        <div className="bg-surface px-5 py-10 sm:px-8">
          <h2 className="font-serif text-2xl font-semibold text-ink">No tickets match these filters.</h2>
          <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-leaf underline-offset-4 hover:underline" href="/admin/tickets">Clear filters</Link>
        </div>
      ) : (
        <div className="divide-y divide-rule bg-surface px-5 sm:px-7">
          {data.tickets.map((ticket) => (
            <article key={ticket.id} className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AdminPriorityBadge priority={ticket.priority} />
                  <AdminStatusBadge status={ticket.status} />
                  <AdminClassificationBadge state={ticket.classificationState} />
                  <span className="text-sm font-semibold tabular-nums text-muted">{ageLabel(ticket.createdAt)}</span>
                </div>
                <h2 className="mt-3 break-words font-serif text-2xl font-semibold leading-tight text-ink">
                  <Link className="rounded-sm outline-none hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2" href={`/admin/tickets/${ticket.id}`}>
                    {ticket.subject}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {ticket.author.name} · {ticket.author.authorId} · {dateFormatter.format(new Date(ticket.createdAt))}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {ticket.book ? `${ticket.book.bookId} · ${ticket.book.title}` : "General / Account Level"}
                </p>
              </div>
              <div className="min-w-0 space-y-3 lg:border-l lg:border-rule lg:pl-5">
                <AdminCategoryBadge category={ticket.category} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted">Assigned</dt><dd className="mt-1 break-words font-semibold text-ink-soft">{ticket.assignedAdmin?.email ?? "Unassigned"}</dd></div>
                  <div><dt className="text-muted">Activity</dt><dd className="mt-1 font-semibold text-ink-soft">{ticket.publicResponseCount} public · {ticket.internalNoteCount} private</dd></div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Support queue pages">
        {data.pagination.page > 1 ? (
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft" href={`/admin/tickets?${queryString(query, data.pagination.page - 1)}`}>Previous</Link>
        ) : <span />}
        <p className="text-sm text-muted">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</p>
        {data.pagination.page < data.pagination.totalPages ? (
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft" href={`/admin/tickets?${queryString(query, data.pagination.page + 1)}`}>Next</Link>
        ) : <span />}
      </nav>
    </div>
  );
}

