import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { listTicketsForAdmin } from "@/server/services/admin-tickets";
import { adminTicketFiltersSchema } from "@/server/validation/admin-ticket";

function value(url: URL, name: string) {
  return url.searchParams.get(name) || undefined;
}

export async function GET(request: Request) {
  try {
    const user = await requireApiRole(request, UserRole.ADMIN);
    const url = new URL(request.url);
    const parsed = adminTicketFiltersSchema.safeParse({
      page: value(url, "page"),
      pageSize: value(url, "pageSize"),
      status: value(url, "status"),
      category: value(url, "category"),
      priority: value(url, "priority"),
      createdFrom: value(url, "createdFrom"),
      createdTo: value(url, "createdTo"),
    });
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Check the ticket filters and try again.",
        parsed.error.flatten().fieldErrors,
      );
    }
    return apiSuccess(await listTicketsForAdmin(user, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}

