import Link from "next/link";
import { Suspense } from "react";

import { TicketDetail } from "@/components/tickets/ticket-detail";

export const metadata = { title: "Ticket details" };

async function TicketDetailForRoute({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <TicketDetail ticketId={ticketId} />;
}

export default function AuthorTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  return (
    <section className="max-w-6xl">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-leaf underline-offset-4 hover:underline" href="/author/tickets">
        Back to my tickets
      </Link>
      <h1 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Ticket details
      </h1>
      <Suspense fallback={<div className="mt-8 h-36 animate-pulse rounded-lg border border-rule bg-surface" />}>
        <TicketDetailForRoute params={params} />
      </Suspense>
    </section>
  );
}

