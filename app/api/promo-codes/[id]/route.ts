import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// PATCH /api/promo-codes/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    // Verify promo code belongs to tenant
    const check = await prisma.promoCode.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!check) return new NextResponse("Promo code not found", { status: 404 });

    const body = await req.json();
    const {
      code,
      description,
      discountType,
      discountValue,
      applicablePlanIds,
      maxRedemptions,
      validFrom,
      validUntil,
      isActive,
    } = body;

    const promoCode = await prisma.promoCode.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(discountType !== undefined && { discountType }),
        ...(discountValue !== undefined && { discountValue }),
        ...(applicablePlanIds !== undefined && {
          applicablePlanIds: applicablePlanIds ? JSON.stringify(applicablePlanIds) : null,
        }),
        ...(maxRedemptions !== undefined && { maxRedemptions }),
        ...(validFrom !== undefined && { validFrom: validFrom ? new Date(validFrom) : null }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ promoCode });
  } catch (error) {
    console.error("Error updating promo code:", error);
    return new NextResponse("Failed to update promo code", { status: 500 });
  }
}

// DELETE /api/promo-codes/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(_req);

    // Verify promo code belongs to tenant
    const check = await prisma.promoCode.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!check) return new NextResponse("Promo code not found", { status: 404 });

    await prisma.promoCode.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting promo code:", error);
    return new NextResponse("Failed to delete promo code", { status: 500 });
  }
}
