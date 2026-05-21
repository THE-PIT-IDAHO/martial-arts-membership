import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/public/waiver-data
// Returns only the settings needed for waiver pages (no sensitive data).
//
// gym_settings: the account page (Account > Preferences) writes individual
// keys (gymName, gymAddress, etc.), while the older waivers/page admin
// editor writes a single "gym_settings" JSON blob. Merge both so the public
// waiver form always sees the latest gym name regardless of which screen
// was used to set it. Individual keys win when both exist.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const settings = await prisma.settings.findMany({
      where: {
        clientId,
        key: {
          in: [
            "waiver_content",
            "gym_settings",
            "gymLogo",
            "gymName",
            "gymAddress",
            "gymPhone",
            "gymEmail",
            "waiver_options",
          ],
        },
      },
    });

    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;

    let mergedGym: { name?: string; address?: string; phone?: string; email?: string } = {};
    if (map.gym_settings) {
      try {
        mergedGym = JSON.parse(map.gym_settings);
      } catch {
        /* fall through */
      }
    }
    if (map.gymName) mergedGym.name = map.gymName;
    if (map.gymAddress) mergedGym.address = map.gymAddress;
    if (map.gymPhone) mergedGym.phone = map.gymPhone;
    if (map.gymEmail) mergedGym.email = map.gymEmail;

    return NextResponse.json({
      waiverContent: map.waiver_content || null,
      gymSettings: Object.keys(mergedGym).length > 0 ? JSON.stringify(mergedGym) : null,
      gymLogo: map.gymLogo || null,
      waiverOptions: map.waiver_options || null,
    });
  } catch (error) {
    console.error("Error loading waiver data:", error);
    return NextResponse.json({ error: "Failed to load waiver data" }, { status: 500 });
  }
}
