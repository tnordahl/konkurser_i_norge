import { PrismaClient } from "@prisma/client";
import { completeDatasetProcessor } from "./complete-dataset-processor";
import { optimizedCompanyService } from "./optimized-company-service";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

interface DatasetComparison {
  newEntities: number;
  updatedEntities: number;
  deletedEntities: number;
  totalChanges: number;
  riskAssessmentResults?: {
    newRiskCompanies: number;
    updatedRiskScores: number;
    newAlerts: number;
  };
}

export class NightlyDatasetService {
  private comparisonStatus = {
    isComparing: false,
    currentStep: "",
    startTime: null as Date | null,
    lastComparison: null as Date | null,
    lastResult: null as DatasetComparison | null,
  };

  async runNightlyUpdate(): Promise<{
    success: boolean;
    downloaded: boolean;
    processed: boolean;
    comparison?: DatasetComparison;
    duration: number;
  }> {
    console.log("🌙 Starting nightly dataset update...");

    const startTime = Date.now();
    this.comparisonStatus.isComparing = true;
    this.comparisonStatus.startTime = new Date();

    try {
      // Step 1: Download latest dataset
      console.log("📥 Step 1: Downloading latest dataset...");
      this.comparisonStatus.currentStep = "Downloading latest dataset";

      const newFilePath =
        await completeDatasetProcessor.downloadLatestDataset();
      console.log(`✅ Downloaded: ${newFilePath}`);

      // Step 2: Compare with existing data (optional - for reporting)
      console.log("🔍 Step 2: Comparing datasets...");
      this.comparisonStatus.currentStep = "Comparing datasets";

      const comparison = await this.compareDatasets(newFilePath);
      console.log(`📊 Changes detected: ${comparison.totalChanges}`);

      // Step 3: Process the new dataset
      console.log("🔄 Step 3: Processing new dataset...");
      this.comparisonStatus.currentStep = "Processing new dataset";

      const result =
        await completeDatasetProcessor.processCompleteDataset(newFilePath);
      console.log(
        `✅ Processing complete: ${result.totalSaved} entities saved`
      );

      // Step 4: Run risk assessment on new/updated companies
      console.log("🔍 Step 4: Running risk assessment...");
      this.comparisonStatus.currentStep = "Running risk assessment";

      const riskAssessmentResults = await this.runRiskAssessment();
      console.log(
        `🚨 Risk assessment: ${riskAssessmentResults.newRiskCompanies} new risk companies identified`
      );

      // Step 5: Cleanup old files (keep last 3 days)
      console.log("🧹 Step 5: Cleaning up old files...");
      this.comparisonStatus.currentStep = "Cleaning up old files";

      await this.cleanupOldFiles();

      const duration = Date.now() - startTime;

      // Update comparison with risk assessment results
      comparison.riskAssessmentResults = riskAssessmentResults;

      this.comparisonStatus.isComparing = false;
      this.comparisonStatus.lastComparison = new Date();
      this.comparisonStatus.lastResult = comparison;

      console.log(
        `✅ Nightly update completed in ${Math.round(duration / 1000)}s`
      );

      return {
        success: true,
        downloaded: true,
        processed: result.success,
        comparison,
        duration: Math.round(duration / 1000),
      };
    } catch (error) {
      console.error("❌ Error in nightly update:", error);
      this.comparisonStatus.isComparing = false;
      throw error;
    }
  }

  private async compareDatasets(
    newFilePath: string
  ): Promise<DatasetComparison> {
    console.log("🔍 Comparing new dataset with existing database...");

    try {
      // Get current database stats
      const currentStats = await prisma.company.aggregate({
        _count: { organizationNumber: true },
      });

      const currentCount = currentStats._count.organizationNumber;
      console.log(
        `📊 Current database: ${currentCount.toLocaleString()} companies`
      );

      // Quick count of new file entities
      const newCount = await this.countEntitiesInFile(newFilePath);
      console.log(`📊 New dataset: ${newCount.toLocaleString()} companies`);

      // For now, we'll do a simple comparison
      // In a more sophisticated version, we could compare organization numbers
      const comparison: DatasetComparison = {
        newEntities: Math.max(0, newCount - currentCount),
        updatedEntities: Math.min(currentCount, newCount), // Assume all existing might be updated
        deletedEntities: Math.max(0, currentCount - newCount),
        totalChanges: Math.abs(newCount - currentCount),
      };

      console.log(`📈 Estimated changes:`);
      console.log(`  New: ${comparison.newEntities.toLocaleString()}`);
      console.log(`  Updated: ${comparison.updatedEntities.toLocaleString()}`);
      console.log(`  Deleted: ${comparison.deletedEntities.toLocaleString()}`);
      console.log(
        `  Total changes: ${comparison.totalChanges.toLocaleString()}`
      );

      return comparison;
    } catch (error) {
      console.error("❌ Error comparing datasets:", error);
      return {
        newEntities: 0,
        updatedEntities: 0,
        deletedEntities: 0,
        totalChanges: 0,
      };
    }
  }

  private async countEntitiesInFile(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const fs = require("fs");
      const { createReadStream } = require("fs");
      const { createInterface } = require("readline");

      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let count = 0;
      let inArray = false;

      rl.on("line", (line: string) => {
        const trimmed = line.trim();
        if (trimmed === "[") {
          inArray = true;
        } else if (trimmed.startsWith("{") && inArray) {
          count++;
        }
      });

      rl.on("close", () => resolve(count));
      rl.on("error", reject);
    });
  }

  /**
   * Run risk assessment on recently updated companies
   * GENERIC: Works for all companies, no hardcoded rules
   */
  private async runRiskAssessment(): Promise<{
    newRiskCompanies: number;
    updatedRiskScores: number;
    newAlerts: number;
  }> {
    try {
      let newRiskCompanies = 0;
      let updatedRiskScores = 0;
      let newAlerts = 0;

      // Find companies updated in the last 24 hours
      const recentlyUpdated = await prisma.company.findMany({
        where: {
          lastUpdated: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        include: {
          riskProfile: true,
          addressHistory: {
            orderBy: { fromDate: "desc" },
            take: 5, // Last 5 address changes
          },
        },
      });

      console.log(
        `🔍 Analyzing ${recentlyUpdated.length} recently updated companies for risk...`
      );

      for (const company of recentlyUpdated) {
        const riskAnalysis = await this.analyzeCompanyRisk(company);

        if (riskAnalysis.shouldCreateRiskProfile) {
          if (!company.riskProfile) {
            // Create new risk company profile
            await prisma.riskCompany.create({
              data: {
                companyId: company.id,
                organizationNumber: company.organizationNumber,
                riskScore: riskAnalysis.riskScore,
                riskLevel: riskAnalysis.riskLevel,
                hasAddressChanges: riskAnalysis.hasAddressChanges,
                hasBankruptcyRisk: riskAnalysis.hasBankruptcyRisk,
                hasShellCompanyTraits: riskAnalysis.hasShellCompanyTraits,
                suspiciousPatterns: riskAnalysis.suspiciousPatterns,
                fraudScore: riskAnalysis.fraudScore,
                investigationPriority: riskAnalysis.investigationPriority,
              },
            });
            newRiskCompanies++;
          } else {
            // Update existing risk profile
            await prisma.riskCompany.update({
              where: { id: company.riskProfile.id },
              data: {
                riskScore: riskAnalysis.riskScore,
                riskLevel: riskAnalysis.riskLevel,
                lastAssessment: new Date(),
                hasAddressChanges: riskAnalysis.hasAddressChanges,
                hasBankruptcyRisk: riskAnalysis.hasBankruptcyRisk,
                hasShellCompanyTraits: riskAnalysis.hasShellCompanyTraits,
                suspiciousPatterns: riskAnalysis.suspiciousPatterns,
                fraudScore: riskAnalysis.fraudScore,
                investigationPriority: riskAnalysis.investigationPriority,
              },
            });
            updatedRiskScores++;
          }

          // Generate fraud indicators for high-risk patterns
          for (const pattern of riskAnalysis.fraudIndicators) {
            await prisma.fraudIndicator.create({
              data: {
                companyId: company.id,
                organizationNumber: company.organizationNumber,
                indicatorType: pattern.type,
                severity: pattern.severity,
                confidence: pattern.confidence,
                description: pattern.description,
                evidence: pattern.evidence,
                detectionMethod: "ALGORITHM",
                detectedBy: "nightly-dataset-service",
              },
            });
            newAlerts++;
          }
        }
      }

      console.log(
        `✅ Risk assessment complete: ${newRiskCompanies} new risk companies, ${updatedRiskScores} updated scores, ${newAlerts} new alerts`
      );

      return {
        newRiskCompanies,
        updatedRiskScores,
        newAlerts,
      };
    } catch (error) {
      console.error("❌ Error in risk assessment:", error);
      return {
        newRiskCompanies: 0,
        updatedRiskScores: 0,
        newAlerts: 0,
      };
    }
  }

  /**
   * Analyze a company for risk factors
   * GENERIC: Uses pattern detection, no hardcoded rules
   */
  private async analyzeCompanyRisk(company: any): Promise<{
    shouldCreateRiskProfile: boolean;
    riskScore: number;
    riskLevel: string;
    hasAddressChanges: boolean;
    hasBankruptcyRisk: boolean;
    hasShellCompanyTraits: boolean;
    suspiciousPatterns: any;
    fraudScore: number;
    investigationPriority: number;
    fraudIndicators: Array<{
      type: string;
      severity: string;
      confidence: number;
      description: string;
      evidence: any;
    }>;
  }> {
    let riskScore = 0;
    let fraudScore = 0;
    const suspiciousPatterns: string[] = [];
    const fraudIndicators: any[] = [];

    // Pattern 1: Multiple address changes
    const addressChanges = company.addressHistory?.length || 0;
    const hasAddressChanges = addressChanges >= 2;
    if (hasAddressChanges) {
      riskScore += 20;
      suspiciousPatterns.push("Multiple address changes");

      if (addressChanges >= 3) {
        fraudScore += 30;
        fraudIndicators.push({
          type: "RAPID_ADDRESS_CHANGES",
          severity: "MEDIUM",
          confidence: 0.7,
          description: `Company has ${addressChanges} address changes`,
          evidence: { addressChangeCount: addressChanges },
        });
      }
    }

    // Pattern 2: Recent registration with immediate address changes
    if (company.registrationDate) {
      const registrationAge =
        Date.now() - new Date(company.registrationDate).getTime();
      const monthsSinceRegistration =
        registrationAge / (1000 * 60 * 60 * 24 * 30);

      if (monthsSinceRegistration < 12 && addressChanges >= 2) {
        riskScore += 40;
        fraudScore += 50;
        suspiciousPatterns.push("New company with rapid address changes");
        fraudIndicators.push({
          type: "SHELL_COMPANY",
          severity: "HIGH",
          confidence: 0.8,
          description:
            "New company with multiple address changes within first year",
          evidence: {
            monthsSinceRegistration: Math.round(monthsSinceRegistration),
            addressChanges,
          },
        });
      }
    }

    // Pattern 3: Bankruptcy indicators
    const hasBankruptcyRisk =
      company.status === "Konkurs" ||
      company.status === "Under avvikling" ||
      company.status === "Under tvangsavvikling";
    if (hasBankruptcyRisk) {
      riskScore += 60;
      fraudScore += 40;
      suspiciousPatterns.push("Bankruptcy or dissolution status");
    }

    // Pattern 4: Shell company traits
    const hasShellCompanyTraits =
      !company.employeeCount || company.employeeCount === 0;
    if (hasShellCompanyTraits && hasAddressChanges) {
      riskScore += 30;
      fraudScore += 35;
      suspiciousPatterns.push("No employees with address changes");
      fraudIndicators.push({
        type: "SHELL_COMPANY",
        severity: "MEDIUM",
        confidence: 0.6,
        description: "Company with no employees and address changes",
        evidence: { employeeCount: company.employeeCount || 0 },
      });
    }

    // Determine risk level
    let riskLevel = "LOW";
    if (riskScore >= 80) riskLevel = "CRITICAL";
    else if (riskScore >= 60) riskLevel = "HIGH";
    else if (riskScore >= 30) riskLevel = "MEDIUM";

    // Investigation priority (1-10)
    const investigationPriority = Math.min(10, Math.floor(fraudScore / 10));

    return {
      shouldCreateRiskProfile: riskScore >= 30, // Only create risk profiles for medium+ risk
      riskScore,
      riskLevel,
      hasAddressChanges,
      hasBankruptcyRisk,
      hasShellCompanyTraits,
      suspiciousPatterns,
      fraudScore,
      investigationPriority,
      fraudIndicators,
    };
  }

  private async cleanupOldFiles(): Promise<void> {
    try {
      const assetsDir = "assets";
      const files = fs.readdirSync(assetsDir);

      // Find all dataset files
      const datasetFiles = files
        .filter(
          (file) => file.startsWith("enheter_alle_") && file.endsWith(".json")
        )
        .map((file) => ({
          name: file,
          path: path.join(assetsDir, file),
          stats: fs.statSync(path.join(assetsDir, file)),
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Keep the 3 most recent files
      const filesToDelete = datasetFiles.slice(3);

      for (const file of filesToDelete) {
        console.log(`🗑️ Deleting old file: ${file.name}`);
        fs.unlinkSync(file.path);
      }

      console.log(`🧹 Cleaned up ${filesToDelete.length} old files`);
    } catch (error) {
      console.error("❌ Error cleaning up old files:", error);
    }
  }

  getComparisonStatus() {
    return {
      ...this.comparisonStatus,
    };
  }

  async getLastUpdateInfo(): Promise<{
    lastUpdate: Date | null;
    nextScheduledUpdate: Date;
    fileInfo?: {
      name: string;
      size: number;
      lastModified: Date;
    };
  }> {
    try {
      // Check for the most recent dataset file
      const assetsDir = "assets";
      const files = fs.readdirSync(assetsDir);

      const datasetFiles = files
        .filter(
          (file) => file.startsWith("enheter_alle") && file.endsWith(".json")
        )
        .map((file) => {
          const filePath = path.join(assetsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            lastModified: stats.mtime,
          };
        })
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      const latestFile = datasetFiles[0];

      // Next update is at 2 AM tomorrow
      const nextUpdate = new Date();
      nextUpdate.setDate(nextUpdate.getDate() + 1);
      nextUpdate.setHours(2, 0, 0, 0);

      return {
        lastUpdate: this.comparisonStatus.lastComparison,
        nextScheduledUpdate: nextUpdate,
        fileInfo: latestFile,
      };
    } catch (error) {
      console.error("❌ Error getting last update info:", error);
      const nextUpdate = new Date();
      nextUpdate.setDate(nextUpdate.getDate() + 1);
      nextUpdate.setHours(2, 0, 0, 0);

      return {
        lastUpdate: null,
        nextScheduledUpdate: nextUpdate,
      };
    }
  }
}

export const nightlyDatasetService = new NightlyDatasetService();
