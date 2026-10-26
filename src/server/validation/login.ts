import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
