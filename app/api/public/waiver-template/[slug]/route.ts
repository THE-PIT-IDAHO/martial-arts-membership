// GET /api/public/waiver-template/[slug]
//
// Public endpoint used by /waivers/sign/<slug> to fetch the template's
// content + options + audience, plus the gym settings/logo so the same
// PDF lib can render. Returns 404 if the slug doesn't exist or has been
// archived — no information about other templates leaks out.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { slug } = await params;

    const template = await prisma.waiverTemplate.findFirst({
      where: { clientId, slug, archivedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        audience: true,
        content: true,
        options: true,
      },
    });
    if (!template) {
      return NextResponse.json({ error: "Waiver not found" }, { status: 404 });
    }

    const settings = await prisma.settings.findMany({
      where: {
        clientId,
        key: { in: ["gymLogo", "gymName", "gymAddress", "gymPhone", "gymEmail", "gym_settings"] },
      },
    });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;

    const mergedGym: { name?: string; address?: string; phone?: string; email?: string } = {};
    if (map.gym_settings) {
      try {
        Object.assign(mergedGym, JSON.parse(map.gym_settings));
      } catch { /* ignore */ }
    }
    if (map.gymName) mergedGym.name = map.gymName;
    if (map.gymAddress) mergedGym.address = map.gymAddress;
    if (map.gymPhone) mergedGym.phone = map.gymPhone;
    if (map.gymEmail) mergedGym.email = map.gymEmail;

    return NextResponse.json({
      template,
      gymSettings: JSON.stringify(mergedGym),
      gymLogo: map.gymLogo || null,
    });
  } catch (err) {
    console.error("Error fetching public waiver template:", err);
    return new NextResponse("Failed to fetch template", { status: 500 });
  }
}
