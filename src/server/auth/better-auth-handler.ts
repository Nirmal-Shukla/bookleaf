import "server-only";

import { auth } from "./auth";

function internalAuthUrl(path: string) {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return new URL(`/api/auth${path}`, baseUrl);
}

export async function callBetterAuth(
  request: Request,
  path: "/sign-in/email" | "/sign-out",
  body: unknown,
) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");

  return auth.handler(
    new Request(internalAuthUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

export function forwardAuthCookies(source: Response, target: Response) {
  const headersWithCookies = source.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithCookies.getSetCookie?.() ?? [];

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      target.headers.append("set-cookie", cookie);
    }
    return target;
  }

  const combinedCookie = source.headers.get("set-cookie");
  if (combinedCookie) {
    target.headers.set("set-cookie", combinedCookie);
  }

  return target;
}
