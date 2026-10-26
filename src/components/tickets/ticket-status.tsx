import type { AuthorTicketStatus } from "@/types/tickets";

const statusStyles: Record<AuthorTicketStatus, string> = {
  Open: "border-ink/20 bg-canvas text-ink-soft",
  "In Progress": "border-leaf/25 bg-leaf-pale text-leaf",
  Resolved: "border-leaf/25 bg-leaf text-white",
  Closed: "border-rule bg-surface text-muted",
};

export function TicketStatus({ status }: { status: AuthorTicketStatus }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

