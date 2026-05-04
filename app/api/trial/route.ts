import { NextResponse } from "next/server";
import { getClientId } from "@/lib/tenant";
import { getTrialStatus } from "@/lib/trial";
import { prisma } from "@/lib/prisma";

// GET /api/trial — get trial status for current tenant
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const status = await getTrialStatus(clientId);

    if (!status.isTrial) {
      return NextResponse.json({ isTrial: false });
    }

    const currentMembers = await prisma.member.count({ where: { clientId } });
    const currentStyles = await prisma.style.count();

    return NextResponse.json({
      ...status,
      currentMembers,
      currentStyles,
    });
  } catch (error) {
    console.error("Error fetching trial status:", error);
    return NextResponse.json({ isTrial: false });
  }
}
