import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await req.json();
    const { name, address, city, state, zipCode, phone, isActive } = body;

    const location = await prisma.location.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(city !== undefined && { city: city?.trim() || null }),
        ...(state !== undefined && { state: state?.trim() || null }),
        ...(zipCode !== undefined && { zipCode: zipCode?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    logAudit({
      entityType: "Location",
      entityId: location.id,
      action: "UPDATE",
      summary: `Updated location "${location.name}"`,
    }).catch(() => {});

    return NextResponse.json({ location });
  } catch (err) {
    console.error("PATCH /api/locations/[id] error:", err);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const location = await prisma.location.findUnique({
      where: { id: params.id },
      select: { name: true },
    });

    await prisma.location.delete({ where: { id: params.id } });

    logAudit({
      entityType: "Location",
      entityId: params.id,
      action: "DELETE",
      summary: `Deleted location "${location?.name || params.id}"`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/locations/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 });
  }
}
