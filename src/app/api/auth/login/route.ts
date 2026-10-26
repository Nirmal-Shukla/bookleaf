import {
  findActiveAuthenticatedUser,
  landingPathForRole,
} from "@/server/auth/authorization";
import {
  callBetterAuth,
  forwardAuthCookies,
} from "@/server/auth/better-auth-handler";
import { AuthorizationError } from "@/server/auth/errors";
import { assertSameOrigin } from "@/server/auth/same-origin";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { loginInputSchema } from "@/server/validation/login";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "A JSON request body is required.");
  }

  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Enter a valid email address and password.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const authResponse = await callBetterAuth(
    request,
    "/sign-in/email",
    parsed.data,
  );

  if (authResponse.status === 429) {
    const response = apiError(
      429,
      "RATE_LIMITED",
      "Too many login attempts. Please wait and try again.",
    );
    const retryAfter =
      authResponse.headers.get("x-retry-after") ??
      authResponse.headers.get("retry-after");
    if (retryAfter) response.headers.set("retry-after", retryAfter);
    return response;
  }

  if (
    authResponse.status === 400 ||
    authResponse.status === 401 ||
    authResponse.status === 403
  ) {
    return apiError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }

  if (!authResponse.ok) {
    return apiError(
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Sign in is temporarily unavailable. Please try again.",
    );
  }

  const authResult = (await authResponse.json()) as {
    user?: { id?: string };
  };
  const user = authResult.user?.id
    ? await findActiveAuthenticatedUser(authResult.user.id)
    : null;

  if (!user) {
    return apiError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }

  return forwardAuthCookies(
    authResponse,
    apiSuccess({
      user,
      redirectTo: landingPathForRole(user.role),
    }),
  );
}
