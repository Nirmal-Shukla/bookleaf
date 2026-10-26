import { z } from "zod";

const authEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must contain at least 32 characters.")
    .refine(
      (value) => !value.startsWith("replace-with-"),
      "SESSION_SECRET must be replaced with a generated secret.",
    ),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
});

export function getAuthEnvironment() {
  const environment = authEnvironmentSchema.parse(process.env);
  const authUrl = new URL(environment.BETTER_AUTH_URL);
  const isLoopback =
    authUrl.hostname === "localhost" || authUrl.hostname === "127.0.0.1";

  if (
    process.env.NODE_ENV === "production" &&
    authUrl.protocol !== "https:" &&
    !isLoopback
  ) {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }

  return {
    ...environment,
    useSecureCookies: authUrl.protocol === "https:",
  };
}
