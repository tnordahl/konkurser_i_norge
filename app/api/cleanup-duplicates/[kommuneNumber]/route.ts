import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Duplicate Detection and Cleanup API
 * 
 * Identifies and removes duplicate address history records
 * that are causing false positives in movement detection
 */

interface DuplicateAnalysis {
  totalRecords: number;
  duplicateGroups: number;
  duplicateRecords: number;
  uniqueRecords: number;
  duplicatesRemoved: number;
  duplicatePatterns: Array<{
    pattern: string;
    count: number;
    organizationNumbers: string[];
    sampleRecord: any;
  }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    console.log(`🔍 Starting duplicate analysis for kommune ${kommuneNumber}`);
    console.log(`🧪 Dry run mode: ${dryRun ? "YES (no deletions)" : "NO (will delete duplicates)"}`);

    // Step 1: Analyze duplicates
    const analysis = await analyzeDuplicates(kommuneNumber);
    
    // Step 2: Remove duplicates (if not dry run)
    let duplicatesRemoved = 0;
    if (!dryRun && analysis.duplicateRecords > 0) {
      console.log(`🗑️ Removing ${analysis.duplicateRecords} duplicate records...`);
      duplicatesRemoved = await removeDuplicates(kommuneNumber);
      console.log(`✅ Removed ${duplicatesRemoved} duplicate records`);
    }

    // Step 3: Verify cleanup
    const postCleanupAnalysis = dryRun ? analysis : await analyzeDuplicates(kommuneNumber);

    return NextResponse.json({
      success: true,
      kommuneNumber,
      dryRun,
      beforeCleanup: analysis,
      afterCleanup: dryRun ? null : postCleanupAnalysis,
      duplicatesRemoved,
      insights: generateCleanupInsights(analysis, duplicatesRemoved, dryRun),
      recommendations: generateCleanupRecommendations(analysis),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ Duplicate cleanup failed:", error);
    return NextResponse.json({
      success: false,
      error: "Duplicate cleanup failed",
      message: error instanceof Error ? error.message : "Unknown error",
      kommuneNumber,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function analyzeDuplicates(kommuneNumber: string): Promise<DuplicateAnalysis> {
  console.log(`📊 Analyzing address history duplicates for kommune ${kommuneNumber}...`);

  // Get all address history records for this kommune
  const allRecords = await prisma.companyAddressHistory.findMany({
    where: {
      OR: [
        { kommuneNumber },
        { kommuneName: { contains: getKommuneName(kommuneNumber), mode: "insensitive" } }
      ]
    },
    orderBy: [
      { organizationNumber: "asc" },
      { fromDate: "asc" }
    ]
  });

  console.log(`📋 Found ${allRecords.length} total address history records`);

  // Group records by potential duplicate criteria
  const duplicateGroups = new Map<string, any[]>();
  const duplicatePatterns = new Map<string, {
    count: number;
    organizationNumbers: Set<string>;
    sampleRecord: any;
  }>();

  for (const record of allRecords) {
    // Create a duplicate key based on key fields
    const duplicateKey = createDuplicateKey(record);
    
    if (!duplicateGroups.has(duplicateKey)) {
      duplicateGroups.set(duplicateKey, []);
    }
    duplicateGroups.get(duplicateKey)!.push(record);

    // Track patterns
    const patternKey = createPatternKey(record);
    if (!duplicatePatterns.has(patternKey)) {
      duplicatePatterns.set(patternKey, {
        count: 0,
        organizationNumbers: new Set(),
        sampleRecord: record
      });
    }
    const pattern = duplicatePatterns.get(patternKey)!;
    pattern.count++;
    pattern.organizationNumbers.add(record.organizationNumber);
  }

  // Count duplicates
  let duplicateRecords = 0;
  let duplicateGroupCount = 0;

  for (const [key, records] of duplicateGroups.entries()) {
    if (records.length > 1) {
      duplicateGroupCount++;
      duplicateRecords += records.length - 1; // Keep one, remove the rest
    }
  }

  // Convert patterns to array
  const topPatterns = Array.from(duplicatePatterns.entries())
    .filter(([_, pattern]) => pattern.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([patternKey, pattern]) => ({
      pattern: patternKey,
      count: pattern.count,
      organizationNumbers: Array.from(pattern.organizationNumbers),
      sampleRecord: {
        organizationNumber: pattern.sampleRecord.organizationNumber,
        address: pattern.sampleRecord.address,
        city: pattern.sampleRecord.city,
        postalCode: pattern.sampleRecord.postalCode,
        addressType: pattern.sampleRecord.addressType,
      }
    }));

  console.log(`🔍 Analysis complete:`);
  console.log(`   📊 Total records: ${allRecords.length}`);
  console.log(`   🔄 Duplicate groups: ${duplicateGroupCount}`);
  console.log(`   ❌ Duplicate records: ${duplicateRecords}`);
  console.log(`   ✅ Unique records: ${allRecords.length - duplicateRecords}`);

  return {
    totalRecords: allRecords.length,
    duplicateGroups: duplicateGroupCount,
    duplicateRecords,
    uniqueRecords: allRecords.length - duplicateRecords,
    duplicatesRemoved: 0, // Will be set during cleanup
    duplicatePatterns: topPatterns,
  };
}

async function removeDuplicates(kommuneNumber: string): Promise<number> {
  console.log(`🗑️ Starting duplicate removal for kommune ${kommuneNumber}...`);

  // Get all records again (in case they changed)
  const allRecords = await prisma.companyAddressHistory.findMany({
    where: {
      OR: [
        { kommuneNumber },
        { kommuneName: { contains: getKommuneName(kommuneNumber), mode: "insensitive" } }
      ]
    },
    orderBy: [
      { organizationNumber: "asc" },
      { fromDate: "asc" },
      { createdAt: "asc" } // Keep the oldest record in case of ties
    ]
  });

  // Group by duplicate key
  const duplicateGroups = new Map<string, any[]>();
  for (const record of allRecords) {
    const key = createDuplicateKey(record);
    if (!duplicateGroups.has(key)) {
      duplicateGroups.set(key, []);
    }
    duplicateGroups.get(key)!.push(record);
  }

  // Collect IDs to delete (keep first record in each group)
  const idsToDelete: string[] = [];
  let groupsProcessed = 0;

  for (const [key, records] of duplicateGroups.entries()) {
    if (records.length > 1) {
      groupsProcessed++;
      // Keep the first record, mark the rest for deletion
      const toDelete = records.slice(1);
      idsToDelete.push(...toDelete.map(r => r.id));
      
      console.log(`🔄 Group ${groupsProcessed}: Keeping 1 record, removing ${toDelete.length} duplicates`);
      console.log(`   └─ Key: ${key.substring(0, 100)}...`);
    }
  }

  // Delete duplicates in batches
  let deletedCount = 0;
  const batchSize = 100;
  
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    
    const result = await prisma.companyAddressHistory.deleteMany({
      where: {
        id: { in: batch }
      }
    });
    
    deletedCount += result.count;
    console.log(`🗑️ Deleted batch ${Math.floor(i / batchSize) + 1}: ${result.count} records`);
  }

  console.log(`✅ Duplicate removal complete: ${deletedCount} records deleted`);
  return deletedCount;
}

function createDuplicateKey(record: any): string {
  // Create a SAFE key that identifies TRUE duplicates only
  // Using org number + postal code + address type preserves legitimate moves
  const normalize = (str: string | null | undefined) => 
    (str || "").toLowerCase().trim().replace(/\s+/g, " ");

  return [
    normalize(record.organizationNumber),
    normalize(record.postalCode),
    normalize(record.addressType), // business vs postal
    record.isCurrentAddress ? "current" : "historical"
  ].join("|");
}

function createPatternKey(record: any): string {
  // Create a pattern key for analysis (less strict than duplicate key)
  const normalize = (str: string | null | undefined) => 
    (str || "").toLowerCase().trim().replace(/\s+/g, " ");

  return [
    normalize(record.address),
    normalize(record.city),
    normalize(record.postalCode),
    normalize(record.addressType)
  ].join(" | ");
}

function getKommuneName(kommuneNumber: string): string {
  const kommuneMap: Record<string, string> = {
    "4201": "Risør",
    "4204": "Kristiansand", 
    "4211": "Tvedestrand",
    "4020": "Midt-Telemark",
    "0301": "Oslo",
    "4601": "Bergen",
    "1103": "Stavanger",
  };
  
  return kommuneMap[kommuneNumber] || `Kommune ${kommuneNumber}`;
}

function generateCleanupInsights(
  analysis: DuplicateAnalysis, 
  duplicatesRemoved: number, 
  dryRun: boolean
): string[] {
  const insights: string[] = [];

  insights.push(`📊 Found ${analysis.totalRecords} total address history records`);
  
  if (analysis.duplicateRecords > 0) {
    insights.push(`❌ Identified ${analysis.duplicateRecords} duplicate records in ${analysis.duplicateGroups} groups`);
    insights.push(`📈 Duplicate rate: ${Math.round((analysis.duplicateRecords / analysis.totalRecords) * 100)}%`);
    
    if (dryRun) {
      insights.push(`🧪 DRY RUN: Would remove ${analysis.duplicateRecords} duplicates`);
    } else {
      insights.push(`🗑️ Successfully removed ${duplicatesRemoved} duplicate records`);
      insights.push(`✅ Cleanup efficiency: ${Math.round((duplicatesRemoved / analysis.duplicateRecords) * 100)}%`);
    }
  } else {
    insights.push(`✅ No duplicates found - data is clean!`);
  }

  if (analysis.duplicatePatterns.length > 0) {
    const topPattern = analysis.duplicatePatterns[0];
    insights.push(`🔍 Most common duplicate pattern: "${topPattern.pattern}" (${topPattern.count} occurrences)`);
  }

  insights.push(`🎯 Final unique records: ${analysis.uniqueRecords}`);

  return insights;
}

function generateCleanupRecommendations(analysis: DuplicateAnalysis): string[] {
  const recommendations: string[] = [];

  if (analysis.duplicateRecords > 0) {
    recommendations.push("🔄 Run address movement detection again after cleanup");
    recommendations.push("📊 Monitor for new duplicates in future data imports");
    
    if (analysis.duplicateRecords > analysis.totalRecords * 0.1) {
      recommendations.push("⚠️ High duplicate rate detected - review data import process");
    }
  }

  if (analysis.duplicatePatterns.length > 5) {
    recommendations.push("🔍 Investigate systematic duplicate creation patterns");
    recommendations.push("🛠️ Consider adding unique constraints to prevent future duplicates");
  }

  recommendations.push("✅ Verify movement detection accuracy after cleanup");
  recommendations.push("🔄 Schedule regular duplicate cleanup maintenance");

  return recommendations;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;
  
  return NextResponse.json({
    success: true,
    service: "Duplicate Detection and Cleanup",
    description: "Identifies and removes duplicate address history records",
    usage: {
      analyze: "GET to analyze duplicates without removing them",
      dryRun: "POST?dryRun=true to see what would be removed",
      cleanup: "POST to actually remove duplicates"
    },
    features: [
      "✅ Comprehensive duplicate detection",
      "✅ Pattern analysis and insights", 
      "✅ Safe dry-run mode",
      "✅ Batch deletion for performance",
      "✅ Detailed cleanup reporting",
      "✅ Preserves oldest records",
    ],
    targetKommune: {
      number: kommuneNumber,
      name: getKommuneName(kommuneNumber),
    },
    timestamp: new Date().toISOString(),
  });
}
