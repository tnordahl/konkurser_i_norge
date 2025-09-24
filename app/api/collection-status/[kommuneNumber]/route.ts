import { NextRequest, NextResponse } from "next/server";

/**
 * Real-time Collection Status API
 * 
 * Provides live status updates for ongoing data collection
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

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;
  const status = getCollectionStatus(kommuneNumber);

  if (!status) {
    return NextResponse.json({
      success: false,
      message: `No active collection found for kommune ${kommuneNumber}`,
      kommuneNumber,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    success: true,
    kommuneNumber,
    status,
    timestamp: new Date().toISOString(),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;
  collectionStatus.delete(kommuneNumber);
  
  return NextResponse.json({
    success: true,
    message: `Collection status cleared for kommune ${kommuneNumber}`,
    kommuneNumber,
    timestamp: new Date().toISOString(),
  });
}
