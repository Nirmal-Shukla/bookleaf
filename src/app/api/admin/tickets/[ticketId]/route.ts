import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import {
  changeTicketAsAdmin,
  getTicketForAdmin,
} from "@/server/services/admin-tickets";
import { adminTicketUpdateSchema } from "@/server/validation/admin-ticket";
import { ticketIdParamSchema } from "@/server/validation/ticket";

type Context = { params: Promise<{ ticketId: string }> };

async function ticketId(context: Context) {
  return ticketIdParamSchema.safeParse((await context.params).ticketId);
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiRole(request, UserRole.ADMIN);
    const parsedId = await ticketId(context);
    if (!parsedId.success) {
      return apiError(400, "INVALID_TICKET_ID", "A valid ticket ID is required.");
    }
    return apiSuccess(await getTicketForAdmin(user, parsedId.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiRole(request, UserRole.ADMIN);
    const parsedId = await ticketId(context);
    if (!parsedId.success) {
      return apiError(400, "INVALID_TICKET_ID", "A valid ticket ID is required.");
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return apiError(400, "INVALID_REQUEST", "A JSON request body is required.");
    }
    const parsed = adminTicketUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Check the ticket changes and try again.",
        parsed.error.flatten().fieldErrors,
      );
    }
    return apiSuccess(await changeTicketAsAdmin(user, parsedId.data, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}

