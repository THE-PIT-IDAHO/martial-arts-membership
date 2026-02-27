import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const clientId = await getClientId(request);
  const where: Record<string, unknown> = { clientId };
  if (status) where.status = status;

  const trials = await prisma.trialPass.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, email: true, memberNumber: true } },
    },
  });

  return NextResponse.json({ trials });
}

export async function POST(request: Request) {
  try {
    const { memberId, maxClasses, expiresAt, notes } = await request.json();

    if (!memberId || !expiresAt) {
      return NextResponse.json(
        { error: "memberId and expiresAt are required" },
        { status: 400 }
      );
    }

    const clientId = await getClientId(request);

    const trial = await prisma.trialPass.create({
      data: {
        memberId,
        maxClasses: maxClasses || 3,
        expiresAt: new Date(expiresAt),
        notes,
        clientId,
        updatedAt: new Date(),
      },
    });

    logAudit({
      entityType: "TrialPass",
      entityId: trial.id,
      action: "CREATE",
      summary: `Created trial pass for member ${memberId}: ${maxClasses || 3} classes`,
    }).catch(() => {});

    return NextResponse.json({ trial }, { status: 201 });
  } catch (error) {
    console.error("Error creating trial:", error);
    return NextResponse.json({ error: "Failed to create trial" }, { status: 500 });
  }
}
