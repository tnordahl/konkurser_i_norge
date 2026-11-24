/**
 * Backfill / catch up the Brreg registry feed pipeline, then resolve names and kommuner.
 *
 *   POSTGRES_PRISMA_URL=... npx tsx scripts/registry-sync.ts [--max-pages N] [--start ISO-date] [--no-resolve]
 *
 * --start only applies on the very first run (no cursor yet). Default: when the
 * feed's change details begin (~2025-08-15).
 *
 * Safe to stop and re-run: progress is stored in registry_feed_cursor and
 * every page is written in one transaction.
 */
import { PrismaClient } from "@prisma/client";
import { ingestFeed, resolvePending } from "../lib/registry/ingest";

async function main() {
  const args = process.argv.slice(2);
  const maxPagesArg = args.indexOf("--max-pages");
  const maxPages = maxPagesArg >= 0 ? Number(args[maxPagesArg + 1]) : undefined;
  const startArg = args.indexOf("--start");
  const startDate = startArg >= 0 ? new Date(args[startArg + 1]).toISOString() : undefined;
  const prisma = new PrismaClient();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
  try {
    const ingest = await ingestFeed(prisma, { maxPages, startDate, log });
    log(`ingest done: ${JSON.stringify(ingest)}`);
    if (args.includes("--no-resolve")) return;
    if (!ingest.caughtUp) {
      log("not caught up yet; skipping resolve (re-run to continue)");
      return;
    }
    let round = 0;
    while (true) {
      const r = await resolvePending(prisma, { limit: 2000, maxSingles: 200, log });
      if (r.skipped || r.movesResolved + r.bankruptciesResolved + r.newOrgsResolved === 0) break;
      if (++round % 10 === 0) log(`resolve round ${round}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
