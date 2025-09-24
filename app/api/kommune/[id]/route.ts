import { NextRequest, NextResponse } from "next/server";
import {
  getBankruptcyDataForKommune,
  updateKommuneData,
  getAllCompaniesForKommune,
} from "@/lib/data-fetcher";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("showAll") === "true";

    if (showAll) {
      // Get all companies in the kommune
      const allCompanies = await getAllCompaniesForKommune(id);
      return NextResponse.json({
        success: true,
        data: allCompanies,
        count: allCompanies.length,
        type: "all_companies",
      });
    } else {
      // Get only bankruptcy data (original behavior)
      const data = await getBankruptcyDataForKommune(id);
      return NextResponse.json({
        success: true,
        data,
        count: data.length,
        type: "bankruptcies_only",
      });
    }
  } catch (error) {
    console.error("Error fetching kommune data:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch kommune data",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const result = await updateKommuneData(id);

    return NextResponse.json({
      success: true,
      message: "Kommune data updated successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error updating kommune data:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update kommune data",
      },
      { status: 500 }
    );
  }
}
