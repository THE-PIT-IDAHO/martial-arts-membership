import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/waiver-data
// Returns only the settings needed for waiver pages (no sensitive data)
export async function GET() {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ["waiver_content", "gym_settings", "gymLogo", "waiver_options"] },
      },
    });

    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;

    return NextResponse.json({
      waiverContent: map.waiver_content || null,
      gymSettings: map.gym_settings || null,
      gymLogo: map.gymLogo || null,
      waiverOptions: map.waiver_options || null,
    });
  } catch (error) {
    console.error("Error loading waiver data:", error);
    return NextResponse.json({ error: "Failed to load waiver data" }, { status: 500 });
  }
}
