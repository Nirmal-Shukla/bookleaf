import { z } from "zod";

export const bookIdParamSchema = z.string().trim().min(1).max(64);
