import { UserRole } from "@/generated/prisma/client";
import { requireApiRole } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { apiSuccess } from "@/server/http/api-response";
import { listBooksForAuthor } from "@/server/services/books";

export async function GET(request: Request) {
  try {
    const user = await requireApiRole(request, UserRole.AUTHOR);
    return apiSuccess(await listBooksForAuthor(user));
  } catch (error) {
    return authErrorResponse(error);
  }
}
