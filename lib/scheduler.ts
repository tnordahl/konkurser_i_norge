import * as cron from "node-cron";
import { updateAllKommunerData } from "./data-fetcher";

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Start the daily cron job for updating all kommune data
 * Runs every day at 2 AM Norwegian time
 */
export function startDailyUpdateScheduler() {
  if (scheduledTask) {
    console.log("Daily update scheduler is already running");
    return;
  }

  // Schedule for 2:00 AM every day (Norwegian time)
  // Using cron expression: "0 2 * * *"
  scheduledTask = cron.schedule(
    "0 2 * * *",
    async () => {
      console.log(
        "Starting scheduled daily update at",
        new Date().toISOString()
      );

      try {
        const result = await updateAllKommunerData();
        console.log("Scheduled update completed successfully:", result);

        // Optional: Send notification or log to monitoring service
        await notifyUpdateCompletion(result);
      } catch (error) {
        console.error("Scheduled update failed:", error);

        // Optional: Send error notification
        await notifyUpdateFailure(error);
      }
    },
    {
      // scheduled: false, // 'scheduled' property not available in TaskOptions
      timezone: "Europe/Oslo",
    }
  );

  scheduledTask.start();
  console.log(
    "Daily update scheduler started - will run every day at 2:00 AM (Norwegian time)"
  );
}

/**
 * Stop the daily update scheduler
 */
export function stopDailyUpdateScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("Daily update scheduler stopped");
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    isRunning:
      scheduledTask !== null && scheduledTask.getStatus() === "scheduled",
    nextRun: scheduledTask ? "Every day at 2:00 AM (Norwegian time)" : null,
  };
}

/**
 * Manually trigger an update (for testing or manual runs)
 */
export async function triggerManualUpdate() {
  console.log("Manual update triggered at", new Date().toISOString());

  try {
    const result = await updateAllKommunerData();
    console.log("Manual update completed successfully:", result);
    return { success: true, ...result };
  } catch (error) {
    console.error("Manual update failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Notify about successful update completion
 */
async function notifyUpdateCompletion(result: any) {
  // This could send to Slack, email, monitoring service, etc.
  console.log("📊 Daily update completed:", {
    timestamp: new Date().toISOString(),
    kommunerUpdated: result.kommunerUpdated,
    totalGapsFilled: result.totalGapsFilled,
    totalRecordsAdded: result.totalRecordsAdded,
  });

  // Example: Log to a monitoring endpoint
  try {
    const monitoringUrl = process.env.MONITORING_WEBHOOK_URL;
    if (monitoringUrl) {
      await fetch(monitoringUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "daily_update_success",
          timestamp: new Date().toISOString(),
          data: result,
        }),
      });
    }
  } catch (error) {
    console.error("Failed to send monitoring notification:", error);
  }
}

/**
 * Notify about update failure
 */
async function notifyUpdateFailure(error: any) {
  console.error("❌ Daily update failed:", {
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
  });

  // Example: Send error notification
  try {
    const monitoringUrl = process.env.MONITORING_WEBHOOK_URL;
    if (monitoringUrl) {
      await fetch(monitoringUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "daily_update_error",
          timestamp: new Date().toISOString(),
          error: error.message,
        }),
      });
    }
  } catch (notifyError) {
    console.error("Failed to send error notification:", notifyError);
  }
}

/**
 * Initialize scheduler when the application starts
 * Call this in your app startup
 */
export function initializeScheduler() {
  // Only start scheduler in production or when explicitly enabled
  const shouldStartScheduler =
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_SCHEDULER === "true";

  if (shouldStartScheduler) {
    startDailyUpdateScheduler();
  } else {
    console.log(
      "Scheduler disabled - set ENABLE_SCHEDULER=true to enable in development"
    );
  }
}
