import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/promotion-events/[id]/charge - Charge promotion fee to participants
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { participantIds, paymentMethod = "ACCOUNT" } = body;

    // Get the event with cost
    const event = await prisma.promotionEvent.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });

    if (!event) {
      return new NextResponse("Promotion event not found", { status: 404 });
    }

    if (!event.costCents || event.costCents <= 0) {
      return new NextResponse("This event has no cost to charge", { status: 400 });
    }

    // Filter participants to charge
    let participantsToCharge = event.participants.filter(
      p => !p.feeCharged && p.status !== "CANCELLED"
    );

    if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
      participantsToCharge = participantsToCharge.filter(p => participantIds.includes(p.id));
    }

    if (participantsToCharge.length === 0) {
      return new NextResponse("No participants to charge", { status: 400 });
    }

    const results: { participantId: string; memberName: string; success: boolean; transactionId?: string; error?: string }[] = [];

    for (const participant of participantsToCharge) {
      try {
        // Get member's active memberships to check for promotion fee discount
        const activeMemberships = await prisma.membership.findMany({
          where: {
            memberId: participant.memberId,
            status: "ACTIVE",
          },
          include: {
            membershipPlan: {
              select: {
                rankPromotionDiscountPercent: true,
              },
            },
          },
        });

        // Find the highest promotion fee discount from their active membership plans
        let discountPercent = 0;
        for (const membership of activeMemberships) {
          const planDiscount = membership.membershipPlan?.rankPromotionDiscountPercent || 0;
          if (planDiscount > discountPercent) {
            discountPercent = planDiscount;
          }
        }

        // Calculate discounted amount
        const originalCents = event.costCents;
        const discountCents = Math.round(originalCents * (discountPercent / 100));
        const finalCents = originalCents - discountCents;

        // Create POS transaction for the promotion fee
        const transactionNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const transaction = await prisma.pOSTransaction.create({
          data: {
            id: crypto.randomUUID(),
            transactionNumber,
            memberId: participant.memberId,
            memberName: participant.memberName,
            subtotalCents: originalCents,
            taxCents: 0,
            discountCents: discountCents,
            totalCents: finalCents,
            paymentMethod,
            notes: `Promotion fee for ${event.name} - ${event.styleName}${discountPercent > 0 ? ` (${discountPercent}% membership discount)` : ""}`,
            updatedAt: new Date(),
            POSLineItem: {
              create: {
                id: crypto.randomUUID(),
                itemName: `Promotion Fee: ${event.name}`,
                type: "promotion_fee",
                quantity: 1,
                unitPriceCents: finalCents,
                subtotalCents: finalCents,
              },
            },
          },
        });

        // Update participant to mark fee as charged
        await prisma.promotionParticipant.update({
          where: { id: participant.id },
          data: {
            feeCharged: true,
            transactionId: transaction.id,
          },
        });

        results.push({
          participantId: participant.id,
          memberName: participant.memberName,
          success: true,
          transactionId: transaction.id,
        });
      } catch (err) {
        console.error(`Error charging ${participant.memberName}:`, err);
        results.push({
          participantId: participant.id,
          memberName: participant.memberName,
          success: false,
          error: "Failed to create transaction",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      charged: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Error charging promotion fees:", error);
    return new NextResponse("Failed to charge promotion fees", { status: 500 });
  }
}
