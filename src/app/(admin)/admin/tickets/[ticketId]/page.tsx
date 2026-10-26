import Link from "next/link";
import { Suspense } from "react";

import { AdminTicketDetail } from "@/components/admin/admin-ticket-detail";

export const metadata = { title: "Admin ticket details" };

async function Detail({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <AdminTicketDetail ticketId={ticketId} />;
}

export default function AdminTicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  return (
    <section className="max-w-7xl">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-leaf underline-offset-4 hover:underline" href="/admin/tickets">Back to support queue</Link>
      <h1 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Ticket operations</h1>
      <Suspense fallback={<div className="mt-8 h-80 animate-pulse border border-rule bg-surface" />}><Detail params={params} /></Suspense>
    </section>
  );
}

