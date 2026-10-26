import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getTicketForAuthor } from "@/server/services/tickets";
import { ticketIdParamSchema } from "@/server/validation/ticket";

type TicketRouteContext = {
  params: Promise<{ ticketId: string }>;
};

export async function GET(request: Request, context: TicketRouteContext) {
  try {
    const user = await requireApiRole(request, UserRole.AUTHOR);
    const parsed = ticketIdParamSchema.safeParse((await context.params).ticketId);

    if (!parsed.success) {
      return apiError(
        400,
        "INVALID_TICKET_ID",
        "A valid ticket ID is required.",
      );
    }

    return apiSuccess(await getTicketForAuthor(user, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}

