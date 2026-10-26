import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import {
  DraftConflictError,
  editResponseDraftAsAdmin,
} from "@/server/services/admin-tickets";
import {
  draftIdParamSchema,
  editResponseDraftSchema,
} from "@/server/validation/admin-ticket";
import { ticketIdParamSchema } from "@/server/validation/ticket";

type Context = { params: Promise<{ ticketId: string; draftId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiRole(request, UserRole.ADMIN);
    const params = await context.params;
    const parsedTicketId = ticketIdParamSchema.safeParse(params.ticketId);
    const parsedDraftId = draftIdParamSchema.safeParse(params.draftId);
    if (!parsedTicketId.success || !parsedDraftId.success) {
      return apiError(400, "INVALID_IDENTIFIER", "Valid ticket and draft IDs are required.");
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return apiError(400, "INVALID_REQUEST", "A JSON request body is required.");
    }
    const parsed = editResponseDraftSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Write a draft between 1 and 5,000 characters.",
        parsed.error.flatten().fieldErrors,
      );
    }
    return apiSuccess(
      await editResponseDraftAsAdmin(user, parsedTicketId.data, {
        draftId: parsedDraftId.data,
        ...parsed.data,
      }),
    );
  } catch (error) {
    if (error instanceof DraftConflictError) {
      return apiError(error.status, error.code, error.message);
    }
    return authErrorResponse(error);
  }
}
