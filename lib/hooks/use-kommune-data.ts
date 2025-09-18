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
      // Refresh data every 2 minutes for better responsiveness
      refreshInterval: 2 * 60 * 1000,
      // Keep data fresh for 30 seconds
      dedupingInterval: 30 * 1000,
      // Revalidate on focus for immediate updates
      revalidateOnFocus: true,
      // Don't revalidate on reconnect to avoid excessive API calls
      revalidateOnReconnect: false,
      // Fewer retries for faster feedback
      errorRetryCount: 2,
      errorRetryInterval: 3000,
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
      // Refresh every 1 minute for latest data
      refreshInterval: 1 * 60 * 1000,
      // Cache for 20 seconds for responsiveness
      dedupingInterval: 20 * 1000,
      revalidateOnFocus: true,
      revalidateOnReconnect: false,
      errorRetryCount: 2,
      errorRetryInterval: 2000,
    }
  );

  return {
    data: data || [],
    error,
    isLoading,
  };
}
