import { requireApiUser } from "@/server/auth/authorization";
import { authErrorResponse } from "@/server/auth/error-response";
import { apiSuccess } from "@/server/http/api-response";

export async function GET(request: Request) {
  try {
    return apiSuccess({ user: await requireApiUser(request) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
