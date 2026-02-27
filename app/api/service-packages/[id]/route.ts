import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET /api/service-packages/:id
export async function GET(req: Request, { params }: RouteParams) {
  const clientId = await getClientId(req);
  const { id } = await params;
  try {
    const pkg = await prisma.servicePackage.findFirst({
      where: { id, clientId },
      include: {
        appointment: { select: { id: true, title: true } },
      },
    });
    if (!pkg) return new NextResponse("Not found", { status: 404 });
    return NextResponse.json({ package: pkg });
  } catch (error) {
    console.error("Error fetching service package:", error);
    return new NextResponse("Failed to load appointment", { status: 500 });
  }
}

// PATCH /api/service-packages/:id
export async function PATCH(req: Request, { params }: RouteParams) {
  const clientId = await getClientId(req);
  const { id } = await params;
  try {
    // Verify tenant ownership
    const existing = await prisma.servicePackage.findFirst({ where: { id, clientId } });
    if (!existing) return new NextResponse("Not found", { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.description === "string" || body.description === null)
      data.description = body.description?.trim() || null;
    if (typeof body.appointmentId === "string" || body.appointmentId === null)
      data.appointmentId = body.appointmentId || null;
    if (typeof body.sessionsIncluded === "number")
      data.sessionsIncluded = body.sessionsIncluded;
    if (typeof body.priceCents === "number") data.priceCents = body.priceCents;
    if (typeof body.expirationDays === "number" || body.expirationDays === null)
      data.expirationDays = body.expirationDays;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.availableOnline === "boolean")
      data.availableOnline = body.availableOnline;
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

    const pkg = await prisma.servicePackage.update({
      where: { id },
      data,
      include: {
        appointment: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ package: pkg });
  } catch (error) {
    console.error("Error updating service package:", error);
    return new NextResponse("Failed to update appointment", { status: 500 });
  }
}

// DELETE /api/service-packages/:id
export async function DELETE(req: Request, { params }: RouteParams) {
  const clientId = await getClientId(req);
  const { id } = await params;
  try {
    // Verify tenant ownership
    const existing = await prisma.servicePackage.findFirst({ where: { id, clientId } });
    if (!existing) return new NextResponse("Not found", { status: 404 });
    // Check for active credits
    const activeCredits = await prisma.memberServiceCredit.count({
      where: { servicePackageId: id, status: "ACTIVE" },
    });
    if (activeCredits > 0) {
      return new NextResponse(
        "Cannot delete: members have active credits for this appointment. Deactivate it instead.",
        { status: 409 }
      );
    }

    await prisma.servicePackage.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting service package:", error);
    return new NextResponse("Failed to delete appointment", { status: 500 });
  }
}
