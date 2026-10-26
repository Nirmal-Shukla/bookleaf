import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getBookForAuthor } from "@/server/services/books";
import { bookIdParamSchema } from "@/server/validation/book";

type BookRouteContext = {
  params: Promise<{ bookId: string }>;
};

export async function GET(request: Request, context: BookRouteContext) {
  try {
    const user = await requireApiRole(request, UserRole.AUTHOR);
    const result = bookIdParamSchema.safeParse((await context.params).bookId);

    if (!result.success) {
      return apiError(400, "INVALID_BOOK_ID", "A valid book ID is required.");
    }

    return apiSuccess(await getBookForAuthor(user, result.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}
