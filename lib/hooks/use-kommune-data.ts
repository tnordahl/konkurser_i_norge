import useSWR from "swr";
import { BankruptcyData } from "../data-fetcher";

/**
 * Fetcher function for SWR - makes HTTP requests to API endpoints
 */
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`
    );
  }
  const result = await response.json();
  return result.data || [];
};

/**
 * SWR hook for fetching kommune bankruptcy data with caching
 */
export function useKommuneData(kommuneNumber: string) {
  const { data, error, isLoading, mutate } = useSWR(
    kommuneNumber ? `/api/kommune/${kommuneNumber}` : null,
    fetcher,
    {
      // Refresh data every 5 minutes
      refreshInterval: 5 * 60 * 1000,
      // Keep data fresh for 1 minute
      dedupingInterval: 60 * 1000,
      // Revalidate on focus
      revalidateOnFocus: true,
      // Don't revalidate on reconnect to avoid excessive API calls
      revalidateOnReconnect: false,
      // Retry on error
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  /**
   * Trigger data update for this kommune
   */
  const triggerUpdate = async () => {
    try {
      // Call the sync API endpoint to update data
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "single",
          kommuneNumber: kommuneNumber,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update failed: ${response.status}`);
      }

      // Revalidate the cache after update
      await mutate();
      return { success: true };
    } catch (error) {
      console.error("Failed to update kommune data:", error);
      return { success: false, error };
    }
  };

  return {
    data: data || [],
    error,
    isLoading,
    mutate,
    triggerUpdate,
  };
}

/**
 * SWR hook for getting latest bankruptcy data with real-time updates
 */
export function useLatestBankruptcies(limit: number = 10) {
  const { data, error, isLoading } = useSWR(
    `/api/latest-bankruptcies?limit=${limit}`,
    fetcher,
    {
      // Refresh every 2 minutes for latest data
      refreshInterval: 2 * 60 * 1000,
      dedupingInterval: 30 * 1000,
      revalidateOnFocus: true,
    }
  );

  return {
    data: data || [],
    error,
    isLoading,
  };
}
