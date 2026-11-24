/**
 * Import history from archived copies of Brreg's company file (Internet
 * Archive, 2019–2026), then fill unknown origins of recorded moves.
 *
 *   POSTGRES_PRISMA_URL=... npx tsx scripts/registry-archive.ts [--fill-only]
 *
 * Streams ~1.1 GB from web.archive.org; nothing is written to disk.
 */
import { PrismaClient } from "@prisma/client";
import { fillOriginsFromArchive, importArchive } from "../lib/registry/archive";

async function main() {
  const prisma = new PrismaClient();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
  try {
    if (!process.argv.includes("--fill-only")) await importArchive(prisma, { log });
    log(`origins filled from archive: ${await fillOriginsFromArchive(prisma)} moves`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
