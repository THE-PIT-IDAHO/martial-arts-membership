import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/public/waiver-data
// Returns only the settings needed for waiver pages (no sensitive data)
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const settings = await prisma.settings.findMany({
      where: {
        clientId,
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
