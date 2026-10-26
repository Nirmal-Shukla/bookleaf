export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHENTICATED";

  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status: 403 | 404;
  readonly code: "FORBIDDEN" | "NOT_FOUND" | "ORIGIN_MISMATCH";

  constructor(
    code: AuthorizationError["code"] = "FORBIDDEN",
    message = "You do not have permission to perform this action.",
    status: AuthorizationError["status"] = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = status;
  }
}
