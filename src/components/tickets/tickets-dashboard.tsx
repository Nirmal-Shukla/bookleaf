"use client";

import Link from "next/link";

import { usePollingJson } from "@/components/shared/use-polling-json";
import type { AuthorTicketsData } from "@/types/tickets";

import { TicketStatus } from "./ticket-status";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function isTicketsData(value: unknown): value is AuthorTicketsData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthorTicketsData>;
  return Array.isArray(candidate.tickets) && Boolean(candidate.pagination);
}

function TicketsLoadingState() {
  return (
    <div className="mt-8 space-y-3" aria-label="Loading tickets" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-lg border border-rule bg-surface"
        />
      ))}
    </div>
  );
}

export function TicketsDashboard({ page }: { page: number }) {
  const { state, refresh } = usePollingJson(
    `/api/author/tickets?page=${page}&pageSize=10`,
    isTicketsData,
  );

  if (state.initialLoading) return <TicketsLoadingState />;

  if (state.error) {
    const sessionExpired = state.error.status === 401;
    return (
      <div className="mt-8 border-y border-rule bg-surface px-5 py-9" role="alert">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {sessionExpired
            ? "Your session has expired."
            : "Your tickets could not be loaded."}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {sessionExpired
            ? "Sign in again to return to your private author workspace."
            : "Check your connection and try again. No ticket data has been changed."}
        </p>
        {sessionExpired ? (
          <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white" href="/login">
            Sign in again
          </Link>
        ) : (
          <button
            type="button"
            className="mt-5 min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white disabled:cursor-not-allowed"
            onClick={() => void refresh(true)}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const { tickets, pagination } = state.data!;
  if (tickets.length === 0 && pagination.totalItems === 0) {
    return (
      <div className="mt-8 border-y border-rule bg-surface px-5 py-12 sm:px-8">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          No support tickets yet.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Create a ticket for a specific title or choose General / Account Level
          for an account-wide question.
        </p>
        <Link
          href="/author/tickets/new"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
        >
          Create a ticket
        </Link>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="mt-8 border-y border-rule bg-surface px-5 py-10" role="status">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          This page has no tickets.
        </h2>
        <Link className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-leaf underline-offset-4 hover:underline" href="/author/tickets?page=1">
          Return to the first page
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {state.refreshFailed ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-pale px-4 py-3 text-sm text-ink-soft" role="status">
          <span>Live updates are temporarily unavailable. This list may be out of date.</span>
          <button className="min-h-9 cursor-pointer font-semibold text-leaf underline-offset-4 hover:underline" type="button" onClick={() => void refresh(false)}>Try now</button>
        </div>
      ) : null}
      <p className="border-b border-rule pb-4 text-sm font-semibold text-ink-soft" aria-live="polite">
        {pagination.totalItems.toLocaleString("en-IN")} {pagination.totalItems === 1 ? "ticket" : "tickets"}
      </p>
      <div className="divide-y divide-rule bg-surface px-5 sm:px-7">
        {tickets.map((ticket) => (
          <article key={ticket.id} className="py-6 sm:py-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted">
                  {dateFormatter.format(new Date(ticket.createdAt))}
                </p>
                <h2 className="mt-2 break-words font-serif text-2xl font-semibold leading-tight text-ink">
                  <Link
                    href={`/author/tickets/${ticket.id}`}
                    className="rounded-sm outline-none hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
                  >
                    {ticket.subject}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {ticket.book
                    ? `${ticket.book.bookId} · ${ticket.book.title}`
                    : "General / Account Level"}
                </p>
              </div>
              <div className="shrink-0"><TicketStatus status={ticket.status} /></div>
            </div>
          </article>
        ))}
      </div>

      <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Ticket pages">
        {pagination.page > 1 ? (
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft" href={`/author/tickets?page=${pagination.page - 1}`}>
            Previous
          </Link>
        ) : <span />}
        <p className="text-sm text-muted">
          Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
        </p>
        {pagination.page < pagination.totalPages ? (
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft" href={`/author/tickets?page=${pagination.page + 1}`}>
            Next
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}

