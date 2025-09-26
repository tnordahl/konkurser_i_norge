/**
 * Collection Status Management
 *
 * Provides utilities for tracking real-time collection status
 */

// In-memory storage for collection status (in production, use Redis or similar)
const collectionStatus = new Map<string, any>();

export function updateCollectionStatus(kommuneNumber: string, status: any) {
  collectionStatus.set(kommuneNumber, {
    ...status,
    lastUpdated: new Date().toISOString(),
  });
}

export function getCollectionStatus(kommuneNumber: string) {
  return collectionStatus.get(kommuneNumber) || null;
}

export function clearCollectionStatus(kommuneNumber: string) {
  collectionStatus.delete(kommuneNumber);
}

