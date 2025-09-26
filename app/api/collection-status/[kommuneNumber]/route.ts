import { NextRequest, NextResponse } from "next/server";
import {
  getCollectionStatus,
  clearCollectionStatus,
} from "@/lib/collection-status";

/**
 * Real-time Collection Status API
 *
 * Provides live status updates for ongoing data collection
 */

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
  clearCollectionStatus(kommuneNumber);

  return NextResponse.json({
    success: true,
    message: `Collection status cleared for kommune ${kommuneNumber}`,
    kommuneNumber,
    timestamp: new Date().toISOString(),
  });
}
