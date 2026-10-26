import { apiError } from "@/server/http/api-response";

import { AuthenticationError, AuthorizationError } from "./errors";

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return apiError(error.status, error.code, error.message);
  }

  if (error instanceof AuthorizationError) {
    return apiError(error.status, error.code, error.message);
  }

  return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
