import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { addInternalNoteAsAdmin } from "@/server/services/admin-tickets";
import { createInternalNoteSchema } from "@/server/validation/admin-ticket";
import { ticketIdParamSchema } from "@/server/validation/ticket";

type Context = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiRole(request, UserRole.ADMIN);
    const parsedId = ticketIdParamSchema.safeParse((await context.params).ticketId);
    if (!parsedId.success) {
      return apiError(400, "INVALID_TICKET_ID", "A valid ticket ID is required.");
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return apiError(400, "INVALID_REQUEST", "A JSON request body is required.");
    }
    const parsed = createInternalNoteSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Write an internal note between 1 and 5,000 characters.",
        parsed.error.flatten().fieldErrors,
      );
    }
    return apiSuccess(
      await addInternalNoteAsAdmin(user, parsedId.data, parsed.data.body),
      { status: 201 },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

