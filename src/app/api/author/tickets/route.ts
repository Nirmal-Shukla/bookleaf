import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { AuthorizationError } from "@/server/auth/errors";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import {
  listTicketsForAuthor,
  submitTicketForAuthor,
  TicketCreationIdempotencyConflictError,
} from "@/server/services/tickets";
import {
  createTicketInputSchema,
  ticketPaginationSchema,
} from "@/server/validation/ticket";

// Classification can make up to three bounded 15-second provider attempts.
// The default Node.js runtime receives a documented 60-second function budget.
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireApiRole(request, UserRole.AUTHOR);
    const url = new URL(request.url);
    const parsed = ticketPaginationSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
      return apiError(
        400,
        "INVALID_PAGINATION",
        "Page and page size must be valid positive integers.",
        parsed.error.flatten().fieldErrors,
      );
    }

    return apiSuccess(
      await listTicketsForAuthor(
        user,
        parsed.data.page,
        parsed.data.pageSize,
      ),
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiRole(request, UserRole.AUTHOR);

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return apiError(
        400,
        "INVALID_REQUEST",
        "A JSON request body is required.",
      );
    }

    const parsed = createTicketInputSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Check the ticket details and try again.",
        parsed.error.flatten().fieldErrors,
      );
    }

    return apiSuccess(await submitTicketForAuthor(user, parsed.data), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof TicketCreationIdempotencyConflictError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof AuthorizationError) {
      return apiError(error.status, error.code, error.message);
    }
    return authErrorResponse(error);
  }
}

