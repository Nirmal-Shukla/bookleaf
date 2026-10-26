"use client";

import Link from "next/link";

import { usePollingJson } from "@/components/shared/use-polling-json";
import type { AuthorTicketData } from "@/types/tickets";

import { TicketStatus } from "./ticket-status";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function isTicketData(value: unknown): value is AuthorTicketData {
  if (!value || typeof value !== "object") return false;
  const ticket = (value as Partial<AuthorTicketData>).ticket;
  return Boolean(
    ticket &&
      typeof ticket.id === "string" &&
      typeof ticket.subject === "string" &&
      Array.isArray(ticket.responses),
  );
}

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const { state, refresh } = usePollingJson(
    `/api/author/tickets/${ticketId}`,
    isTicketData,
  );

  if (state.initialLoading) {
    return (
      <div className="mt-8 space-y-5" aria-label="Loading ticket" aria-busy="true">
        <div className="h-36 animate-pulse rounded-lg border border-rule bg-surface" />
        <div className="h-52 animate-pulse rounded-lg border border-rule bg-surface" />
      </div>
    );
  }

  if (state.error) {
    const kind =
      state.error.status === 401
        ? "session"
        : state.error.status === 404
          ? "missing"
          : "request";
    const title =
      kind === "session"
        ? "Your session has expired."
        : kind === "missing"
          ? "This ticket is not available."
          : "The ticket could not be loaded.";
    return (
      <div className="mt-8 border-y border-rule bg-surface px-5 py-10" role="alert">
        <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {kind === "missing"
            ? "It may not exist, or it may not belong to your account."
            : "Try again, or return to your ticket list."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {kind === "request" ? (
            <button className="min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white" type="button" onClick={() => void refresh(true)}>
              Try again
            </button>
          ) : null}
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-white px-5 text-sm font-semibold text-ink-soft" href={kind === "session" ? "/login" : "/author/tickets"}>
            {kind === "session" ? "Sign in again" : "Back to my tickets"}
          </Link>
        </div>
      </div>
    );
  }

  const ticket = state.data!.ticket;
  return (
    <div className="mt-8 max-w-4xl">
      {state.refreshFailed ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-pale px-4 py-3 text-sm text-ink-soft" role="status">
          <span>Live updates are temporarily unavailable. The ticket shown below is unchanged.</span>
          <button className="min-h-9 cursor-pointer font-semibold text-leaf underline-offset-4 hover:underline" type="button" onClick={() => void refresh(false)}>Try now</button>
        </div>
      ) : null}
      <section className="border-y border-rule bg-surface px-5 py-7 sm:px-8" aria-labelledby="ticket-subject">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted">
              Created {dateFormatter.format(new Date(ticket.createdAt))}
            </p>
            <h2 id="ticket-subject" className="mt-2 break-words font-serif text-3xl font-semibold leading-tight text-ink">
              {ticket.subject}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {ticket.book
                ? `${ticket.book.bookId} · ${ticket.book.title}`
                : "General / Account Level"}
            </p>
          </div>
          <div className="shrink-0"><TicketStatus status={ticket.status} /></div>
        </div>

        <div className="mt-7 border-t border-rule pt-6">
          <h3 className="text-sm font-semibold text-ink-soft">Original query</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-ink-soft">
            {ticket.description}
          </p>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="responses-heading">
        <div className="flex items-end justify-between gap-4 border-b border-rule pb-4">
          <h2 id="responses-heading" className="font-serif text-2xl font-semibold text-ink">
            BookLeaf responses
          </h2>
          <p className="text-sm text-muted">{ticket.responses.length}</p>
        </div>
        {ticket.responses.length === 0 ? (
          <div className="bg-surface px-5 py-8 sm:px-8">
            <p className="text-sm leading-6 text-muted">
              No public response has been sent yet. A response will appear here after BookLeaf support sends it.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-rule bg-surface px-5 sm:px-8">
            {ticket.responses.map((response) => (
              <li key={response.id} className="py-7">
                <p className="text-sm font-semibold text-leaf">BookLeaf support</p>
                <p className="mt-1 text-sm text-muted">{dateFormatter.format(new Date(response.createdAt))}</p>
                <p className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-ink-soft">{response.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

