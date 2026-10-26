import type {
  AdminClassificationState,
  AdminTicketCategory,
  AdminTicketPriority,
} from "@/types/admin-tickets";
import type { AuthorTicketStatus } from "@/types/tickets";

import { TicketStatus } from "../tickets/ticket-status";

export function AdminPriorityBadge({
  priority,
}: {
  priority: AdminTicketPriority | null;
}) {
  const style =
    priority === "Critical"
      ? "border-critical/30 bg-critical-pale text-critical"
      : priority === "High"
        ? "border-warning/30 bg-warning-pale text-warning"
        : priority
          ? "border-rule bg-surface text-ink-soft"
          : "border-dashed border-rule bg-canvas text-muted";
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-semibold ${style}`}>
      {priority ?? "Unclassified priority"}
    </span>
  );
}

export function AdminCategoryBadge({
  category,
}: {
  category: AdminTicketCategory | null;
}) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-semibold ${
        category
          ? "border-rule bg-surface text-ink-soft"
          : "border-dashed border-rule bg-canvas text-muted"
      }`}
    >
      {category ?? "Unclassified category"}
    </span>
  );
}

export function AdminStatusBadge({ status }: { status: AuthorTicketStatus }) {
  return <TicketStatus status={status} />;
}

export function AdminClassificationBadge({
  state,
}: {
  state: AdminClassificationState;
}) {
  const style =
    state === "Completed"
      ? "border-leaf/30 bg-leaf-pale text-leaf"
      : state === "Failed"
        ? "border-critical/30 bg-critical-pale text-critical"
        : "border-warning/30 bg-warning-pale text-warning";
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-semibold ${style}`}
    >
      AI {state.toLowerCase()}
    </span>
  );
}

