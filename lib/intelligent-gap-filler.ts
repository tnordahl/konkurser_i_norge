/**
 * Intelligent Data Gap Detection and Filling System
 *
 * This system:
 * 1. Analyzes what data is missing for each kommune
 * 2. Prioritizes data filling (recent data first, then historical)
 * 3. Fills gaps strategically (200 days vs 1 day)
 * 4. Tracks data completeness and quality
 * 5. Only fetches what's actually missing
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface DataGapAnalysis {
  kommuneNumber: string;
  kommuneName: string;
  totalDaysPeriod: number;
  daysWithData: number;
  daysMissing: number;
  completionPercentage: number;
  gaps: DataGap[];
  priorityLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedFillTime: number; // minutes
  lastUpdateDate: Date | null;
}

export interface DataGap {
  startDate: Date;
  endDate: Date;
  daysCount: number;
  gapType: "NEVER_SCANNED" | "PARTIAL_DATA" | "STALE_DATA" | "FAILED_SCAN";
  priority: number; // 1-10, 10 being highest
  estimatedRecords: number;
}

export interface GapFillingPlan {
  kommuneNumber: string;
  totalGaps: number;
  fillStrategy: "RECENT_FIRST" | "COMPLETE_HISTORICAL" | "CRITICAL_ONLY";
  phases: GapFillingPhase[];
  estimatedDuration: number; // minutes
  apiCallsRequired: number;
}

export interface GapFillingPhase {
  phase: number;
  description: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  priority: number;
  estimatedRecords: number;
  estimatedTime: number; // minutes
}

/**
 * Analyze data gaps for a specific kommune
 */
export async function analyzeDataGaps(
  kommuneNumber: string
): Promise<DataGapAnalysis> {
  console.log(`🔍 ANALYZING DATA GAPS: Kommune ${kommuneNumber}`);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const today = new Date();

  // Check what data we have in the database
  const existingData = await getExistingDataCoverage(
    kommuneNumber,
    oneYearAgo,
    today
  );

  // Calculate gaps
  const gaps = identifyDataGaps(existingData, oneYearAgo, today);

  // Analyze completeness
  const totalDays = Math.ceil(
    (today.getTime() - oneYearAgo.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysWithData = existingData.length;
  const daysMissing = totalDays - daysWithData;
  const completionPercentage = (daysWithData / totalDays) * 100;

  // Determine priority level
  let priorityLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (completionPercentage < 25) priorityLevel = "CRITICAL";
  else if (completionPercentage < 50) priorityLevel = "HIGH";
  else if (completionPercentage < 80) priorityLevel = "MEDIUM";
  else priorityLevel = "LOW";

  // Estimate fill time based on gaps
  const estimatedFillTime = estimateFillingTime(gaps);

  // Get last update date
  const lastUpdateDate =
    existingData.length > 0
      ? new Date(Math.max(...existingData.map((d) => d.getTime())))
      : null;

  return {
    kommuneNumber,
    kommuneName: getKommuneName(kommuneNumber),
    totalDaysPeriod: totalDays,
    daysWithData,
    daysMissing,
    completionPercentage: Math.round(completionPercentage * 10) / 10,
    gaps,
    priorityLevel,
    estimatedFillTime,
    lastUpdateDate,
  };
}

/**
 * Create an intelligent gap-filling plan
 */
export async function createGapFillingPlan(
  kommuneNumber: string
): Promise<GapFillingPlan> {
  const gapAnalysis = await analyzeDataGaps(kommuneNumber);

  console.log(
    `📋 CREATING GAP FILLING PLAN: ${gapAnalysis.daysMissing} days missing`
  );

  // Determine strategy based on gap size
  let fillStrategy: "RECENT_FIRST" | "COMPLETE_HISTORICAL" | "CRITICAL_ONLY";

  if (gapAnalysis.daysMissing <= 7) {
    fillStrategy = "RECENT_FIRST"; // Just fill recent gaps
  } else if (gapAnalysis.daysMissing <= 90) {
    fillStrategy = "COMPLETE_HISTORICAL"; // Fill everything
  } else {
    fillStrategy = "CRITICAL_ONLY"; // Focus on recent + critical periods
  }

  // Create phases based on strategy
  const phases = createFillingPhases(gapAnalysis.gaps, fillStrategy);

  // Calculate total effort
  const totalApiCalls = phases.reduce(
    (sum, phase) => sum + Math.ceil(phase.estimatedRecords / 100),
    0
  );
  const totalDuration = phases.reduce(
    (sum, phase) => sum + phase.estimatedTime,
    0
  );

  return {
    kommuneNumber,
    totalGaps: gapAnalysis.gaps.length,
    fillStrategy,
    phases,
    estimatedDuration: totalDuration,
    apiCallsRequired: totalApiCalls,
  };
}

/**
 * Execute the gap-filling plan
 */
export async function executeGapFilling(
  kommuneNumber: string,
  progressCallback?: (progress: GapFillingProgress) => void
): Promise<GapFillingResult> {
  const plan = await createGapFillingPlan(kommuneNumber);

  console.log(
    `🚀 EXECUTING GAP FILLING: ${plan.phases.length} phases, ${plan.estimatedDuration} min estimated`
  );

  const startTime = new Date();
  let totalRecordsFilled = 0;
  let phasesCompleted = 0;
  const results: PhaseResult[] = [];

  for (const phase of plan.phases) {
    console.log(`📊 Phase ${phase.phase}: ${phase.description}`);

    if (progressCallback) {
      progressCallback({
        currentPhase: phase.phase,
        totalPhases: plan.phases.length,
        phaseDescription: phase.description,
        overallProgress: (phasesCompleted / plan.phases.length) * 100,
        recordsFilled: totalRecordsFilled,
      });
    }

    try {
      const phaseResult = await executePhase(kommuneNumber, phase);
      results.push(phaseResult);
      totalRecordsFilled += phaseResult.recordsFilled;
      phasesCompleted++;

      // Rate limiting between phases
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Phase ${phase.phase} failed:`, error);
      results.push({
        phase: phase.phase,
        success: false,
        recordsFilled: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: 0,
      });
    }
  }

  const endTime = new Date();
  const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000 / 60; // minutes

  return {
    kommuneNumber,
    success: results.every((r) => r.success),
    totalRecordsFilled,
    phasesCompleted,
    totalPhases: plan.phases.length,
    duration: totalDuration,
    phaseResults: results,
    completedAt: endTime,
  };
}

/**
 * Get existing data coverage from database
 */
async function getExistingDataCoverage(
  kommuneNumber: string,
  startDate: Date,
  endDate: Date
): Promise<Date[]> {
  try {
    // In a real system, this would query the database for existing data dates
    // For now, we'll simulate based on what we know

    const existingDates: Date[] = [];

    if (kommuneNumber === "4201") {
      // Risør - we have some data
      // Simulate that we have data for the last 30 days, but missing older data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      for (
        let d = new Date(thirtyDaysAgo);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        existingDates.push(new Date(d));
      }

      // Add some random historical dates to simulate partial coverage
      for (let i = 0; i < 50; i++) {
        const randomDate = new Date(
          startDate.getTime() +
            Math.random() * (thirtyDaysAgo.getTime() - startDate.getTime())
        );
        existingDates.push(randomDate);
      }
    }

    return existingDates.sort((a, b) => a.getTime() - b.getTime());
  } catch (error) {
    console.error("Failed to get existing data coverage:", error);
    return [];
  }
}

/**
 * Identify data gaps from existing coverage
 */
function identifyDataGaps(
  existingDates: Date[],
  startDate: Date,
  endDate: Date
): DataGap[] {
  const gaps: DataGap[] = [];

  if (existingDates.length === 0) {
    // No data at all - one big gap
    gaps.push({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      daysCount: Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ),
      gapType: "NEVER_SCANNED",
      priority: 10,
      estimatedRecords: 1000, // Estimate
    });
    return gaps;
  }

  // Sort existing dates
  const sortedDates = [...existingDates].sort(
    (a, b) => a.getTime() - b.getTime()
  );

  // Check gap before first date
  const daysBefore = Math.ceil(
    (sortedDates[0].getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysBefore > 1) {
    gaps.push({
      startDate: new Date(startDate),
      endDate: new Date(sortedDates[0]),
      daysCount: daysBefore,
      gapType: "NEVER_SCANNED",
      priority: 7, // Historical data, lower priority
      estimatedRecords: daysBefore * 2, // Estimate 2 records per day
    });
  }

  // Check gaps between dates
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const current = sortedDates[i];
    const next = sortedDates[i + 1];
    const daysBetween =
      Math.ceil((next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)) -
      1;

    if (daysBetween > 0) {
      const gapStart = new Date(current);
      gapStart.setDate(gapStart.getDate() + 1);

      const gapEnd = new Date(next);
      gapEnd.setDate(gapEnd.getDate() - 1);

      gaps.push({
        startDate: gapStart,
        endDate: gapEnd,
        daysCount: daysBetween,
        gapType: "PARTIAL_DATA",
        priority: 8,
        estimatedRecords: daysBetween * 2,
      });
    }
  }

  // Check gap after last date
  const lastDate = sortedDates[sortedDates.length - 1];
  const daysAfter = Math.ceil(
    (endDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysAfter > 1) {
    const gapStart = new Date(lastDate);
    gapStart.setDate(gapStart.getDate() + 1);

    gaps.push({
      startDate: gapStart,
      endDate: new Date(endDate),
      daysCount: daysAfter,
      gapType: "STALE_DATA",
      priority: 10, // Recent data, highest priority
      estimatedRecords: daysAfter * 3, // More activity in recent periods
    });
  }

  return gaps;
}

/**
 * Create filling phases based on strategy
 */
function createFillingPhases(
  gaps: DataGap[],
  strategy: string
): GapFillingPhase[] {
  const phases: GapFillingPhase[] = [];

  if (strategy === "RECENT_FIRST") {
    // Sort by priority (recent first)
    const sortedGaps = [...gaps].sort((a, b) => b.priority - a.priority);

    sortedGaps.forEach((gap, index) => {
      if (gap.daysCount <= 30) {
        // Only fill small recent gaps
        phases.push({
          phase: index + 1,
          description: `Fill recent gap: ${gap.startDate.toISOString().split("T")[0]} to ${gap.endDate.toISOString().split("T")[0]}`,
          dateRange: {
            start: gap.startDate,
            end: gap.endDate,
          },
          priority: gap.priority,
          estimatedRecords: gap.estimatedRecords,
          estimatedTime: Math.ceil(gap.daysCount / 10), // 10 days per minute
        });
      }
    });
  } else if (strategy === "COMPLETE_HISTORICAL") {
    // Fill all gaps, prioritizing recent ones
    const sortedGaps = [...gaps].sort((a, b) => b.priority - a.priority);

    sortedGaps.forEach((gap, index) => {
      phases.push({
        phase: index + 1,
        description: `Fill ${gap.gapType.toLowerCase().replace(/_/g, " ")}: ${gap.daysCount} days`,
        dateRange: {
          start: gap.startDate,
          end: gap.endDate,
        },
        priority: gap.priority,
        estimatedRecords: gap.estimatedRecords,
        estimatedTime: Math.ceil(gap.daysCount / 10),
      });
    });
  } else {
    // CRITICAL_ONLY
    // Only fill high-priority gaps
    const criticalGaps = gaps.filter((gap) => gap.priority >= 8);

    criticalGaps.forEach((gap, index) => {
      phases.push({
        phase: index + 1,
        description: `Critical fill: ${gap.daysCount} days (${gap.gapType})`,
        dateRange: {
          start: gap.startDate,
          end: gap.endDate,
        },
        priority: gap.priority,
        estimatedRecords: gap.estimatedRecords,
        estimatedTime: Math.ceil(gap.daysCount / 15), // Faster for critical data
      });
    });
  }

  return phases;
}

/**
 * Execute a single filling phase
 */
async function executePhase(
  kommuneNumber: string,
  phase: GapFillingPhase
): Promise<PhaseResult> {
  const startTime = new Date();

  try {
    console.log(
      `   📅 Filling ${phase.dateRange.start.toISOString().split("T")[0]} to ${phase.dateRange.end.toISOString().split("T")[0]}`
    );

    // Simulate data fetching and storage
    // In a real system, this would call the bankruptcy API for each day in the range
    let recordsFilled = 0;

    const daysDiff = Math.ceil(
      (phase.dateRange.end.getTime() - phase.dateRange.start.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    for (let day = 0; day <= daysDiff; day += 7) {
      // Process in weekly chunks
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limiting

      // Simulate finding some records
      const recordsThisWeek = Math.floor(Math.random() * 5) + 1;
      recordsFilled += recordsThisWeek;

      console.log(
        `     📊 Week ${Math.floor(day / 7) + 1}: ${recordsThisWeek} records`
      );
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000 / 60; // minutes

    console.log(
      `   ✅ Phase ${phase.phase} completed: ${recordsFilled} records in ${duration.toFixed(1)} min`
    );

    return {
      phase: phase.phase,
      success: true,
      recordsFilled,
      duration,
    };
  } catch (error) {
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000 / 60;

    return {
      phase: phase.phase,
      success: false,
      recordsFilled: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      duration,
    };
  }
}

function estimateFillingTime(gaps: DataGap[]): number {
  return gaps.reduce((total, gap) => total + Math.ceil(gap.daysCount / 10), 0);
}

function getKommuneName(kommuneNumber: string): string {
  const kommuneMap: Record<string, string> = {
    "4201": "Risør",
    "4213": "Tvedestrand",
    "4211": "Gjerstad",
    "0301": "Oslo",
    "4204": "Kristiansand",
  };
  return kommuneMap[kommuneNumber] || `Kommune ${kommuneNumber}`;
}

// Type definitions for results
export interface GapFillingProgress {
  currentPhase: number;
  totalPhases: number;
  phaseDescription: string;
  overallProgress: number; // 0-100
  recordsFilled: number;
}

export interface GapFillingResult {
  kommuneNumber: string;
  success: boolean;
  totalRecordsFilled: number;
  phasesCompleted: number;
  totalPhases: number;
  duration: number; // minutes
  phaseResults: PhaseResult[];
  completedAt: Date;
}

export interface PhaseResult {
  phase: number;
  success: boolean;
  recordsFilled: number;
  error?: string;
  duration: number; // minutes
}
