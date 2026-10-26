import {
  callBetterAuth,
  forwardAuthCookies,
} from "@/server/auth/better-auth-handler";
import { AuthorizationError } from "@/server/auth/errors";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }

  const authResponse = await callBetterAuth(request, "/sign-out", {});

  if (!authResponse.ok) {
    return apiError(500, "LOGOUT_FAILED", "Logout could not be completed.");
  }

  return forwardAuthCookies(
    authResponse,
    apiSuccess({ loggedOut: true }),
  );
}
