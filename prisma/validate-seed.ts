import "dotenv/config";

import { z } from "zod";

import { createPrismaClient } from "../src/server/database/prisma";
import { loadSourceData } from "./source-data";
import { validateSeededData } from "./seed-validation";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
});

async function main() {
  const environment = environmentSchema.parse(process.env);
  const sourceData = await loadSourceData();
  const prisma = createPrismaClient(environment.DATABASE_URL);

  try {
    const summary = await validateSeededData(prisma, sourceData);
    console.log(
      JSON.stringify(
        {
          message: "Seeded BookLeaf records match the source JSON.",
          ...summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Unknown seed validation error",
  );
  process.exitCode = 1;
});
