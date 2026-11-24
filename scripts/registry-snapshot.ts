/**
 * Seed known business addresses for every organisation from Brreg's nightly
 * register snapshot, so future moves get a real origin ("from").
 *
 *   POSTGRES_PRISMA_URL=... npx tsx scripts/registry-snapshot.ts
 *
 * Streams ~211 MB (gzip) from data.brreg.no; nothing is written to disk.
 * Run scripts/registry-sync.ts first — the import refuses to run if the feed
 * cursor is older than the snapshot. Safe to re-run (e.g. monthly) to pick up
 * newly registered companies; existing feed data is never overwritten.
 */
import { PrismaClient } from "@prisma/client";
import { importSnapshot } from "../lib/registry/snapshot";

async function main() {
  const prisma = new PrismaClient();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
  try {
    await importSnapshot(prisma, { log });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
