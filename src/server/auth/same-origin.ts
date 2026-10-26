import { AuthorizationError } from "./errors";

export function assertSameOrigin(
  request: Request,
  expectedOrigin = new URL(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).origin,
) {
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (fetchSite === "cross-site" || !origin || origin !== expectedOrigin) {
    throw new AuthorizationError(
      "ORIGIN_MISMATCH",
      "This request was not sent from the BookLeaf portal.",
    );
  }
}
