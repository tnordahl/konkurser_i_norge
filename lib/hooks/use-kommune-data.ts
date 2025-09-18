import useSWR from "swr";
import {
  BankruptcyData,
  getBankruptcyDataForKommune,
  updateKommuneData,
} from "../data-fetcher";

/**
 * SWR hook for fetching kommune bankruptcy data with caching
 */
export function useKommuneData(kommuneNumber: string) {
  const { data, error, isLoading, mutate } = useSWR(
    kommuneNumber ? `kommune-data-${kommuneNumber}` : null,
    () => getBankruptcyDataForKommune(kommuneNumber),
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
      await updateKommuneData(kommuneNumber);
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
    `latest-bankruptcies-${limit}`,
    async () => {
      // Fetch latest bankruptcies across all kommuner from Postgres
      const { prisma } = await import("../database");

      try {
        const bankruptcies = await prisma.bankruptcy.findMany({
          take: limit,
          orderBy: {
            bankruptcyDate: "desc",
          },
          include: {
            kommune: {
              select: {
                name: true,
                kommuneNumber: true,
                county: true,
              },
            },
          },
        });

        return bankruptcies.map((b) => ({
          id: b.id,
          companyName: b.companyName,
          organizationNumber: b.organizationNumber,
          bankruptcyDate: b.bankruptcyDate.toISOString().split("T")[0],
          kommune: {
            name: b.kommune.name,
            kommuneNumber: b.kommune.kommuneNumber,
            county: b.kommune.county,
          },
          address: b.address,
          industry: b.industry,
          hasRecentAddressChange: b.hasRecentAddressChange,
        }));
      } catch (error) {
        console.error("Failed to fetch latest bankruptcies:", error);
        throw new Error("Failed to fetch latest bankruptcy data");
      }
    },
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
