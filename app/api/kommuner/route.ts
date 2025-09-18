import { NextResponse } from "next/server";
import { getAllKommuner } from "@/lib/data-fetcher";

export async function GET() {
  try {
    console.log("🔍 Fetching all kommuner...");
    const kommuner = await getAllKommuner();
    console.log(`✅ Found ${kommuner.length} kommuner`);

    return NextResponse.json({
      success: true,
      count: kommuner.length,
      kommuner,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to fetch kommuner:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
