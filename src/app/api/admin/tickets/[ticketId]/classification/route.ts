import { UserRole } from "@/generated/prisma/client";
import { ClassificationNotRetryableError } from "@/server/ai/classification";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { retryClassificationAsAdmin } from "@/server/services/admin-tickets";
import { ticketIdParamSchema } from "@/server/validation/ticket";

export const maxDuration = 60;

type Context = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiRole(request, UserRole.ADMIN);
    const parsedId = ticketIdParamSchema.safeParse((await context.params).ticketId);
    if (!parsedId.success) {
      return apiError(400, "INVALID_TICKET_ID", "A valid ticket ID is required.");
    }
    return apiSuccess(await retryClassificationAsAdmin(user, parsedId.data));
  } catch (error) {
    if (error instanceof ClassificationNotRetryableError) {
      return apiError(error.status, error.code, error.message);
    }
    return authErrorResponse(error);
  }
}
