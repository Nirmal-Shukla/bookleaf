import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, betterAuth } from "better-auth";

import { prisma } from "@/server/database/prisma";
import { getAuthEnvironment } from "@/server/validation/environment";

import { hashPassword, verifyPassword } from "./password";

const environment = getAuthEnvironment();

export const auth = betterAuth({
  appName: "BookLeaf Author Support",
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.SESSION_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 1024,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  user: {
    fields: {
      email: "normalizedEmail",
      name: "email",
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
  },
  account: {
    modelName: "AuthAccount",
  },
  verification: {
    modelName: "AuthVerification",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "AuthRateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
    },
  },
  trustedOrigins: [environment.BETTER_AUTH_URL],
  advanced: {
    useSecureCookies: environment.useSecureCookies,
    database: {
      generateId: "uuid",
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });

          if (!user?.isActive) {
            throw APIError.from("UNAUTHORIZED", {
              code: "INVALID_EMAIL_OR_PASSWORD",
              message: "Invalid email or password",
            });
          }

          return { data: session };
        },
      },
    },
  },
});

export type BetterAuthSession = typeof auth.$Infer.Session;
