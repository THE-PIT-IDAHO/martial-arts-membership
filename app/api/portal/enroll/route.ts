import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEnrollmentConfirmationEmail } from "@/lib/notifications";

// POST /api/portal/enroll — Public endpoint
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      firstName, lastName, email, phone,
      dateOfBirth, address, city, state, zipCode,
      emergencyContactName, emergencyContactPhone,
      parentGuardianName, medicalNotes,
      selectedPlanId, waiverSigned, promoCode, leadSource,
    } = body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "First name, last name, and email are required" },
        { status: 400 }
      );
    }

    // Get plan name for confirmation email
    let planName: string | undefined;
    if (selectedPlanId) {
      const plan = await prisma.membershipPlan.findUnique({
        where: { id: selectedPlanId },
        select: { name: true },
      });
      planName = plan?.name;
    }

    // Validate and process promo code if provided
    let promoDiscountCents: number | null = null;
    if (promoCode) {
      const promo = await prisma.promoCode.findUnique({
        where: { code: promoCode.toUpperCase() },
      });
      if (promo && promo.isActive) {
        // Increment redemption count
        await prisma.promoCode.update({
          where: { id: promo.id },
          data: { redemptionCount: { increment: 1 } },
        });
        // Calculate discount for record-keeping
        if (selectedPlanId) {
          const plan = await prisma.membershipPlan.findUnique({
            where: { id: selectedPlanId },
            select: { priceCents: true },
          });
          if (plan?.priceCents) {
            promoDiscountCents = promo.discountType === "PERCENT"
              ? Math.round(plan.priceCents * (promo.discountValue / 100))
              : promo.discountValue;
          }
        }
      }
    }

    const submission = await prisma.enrollmentSubmission.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone?.trim() || null,
        parentGuardianName: parentGuardianName?.trim() || null,
        medicalNotes: medicalNotes?.trim() || null,
        selectedPlanId: selectedPlanId || null,
        waiverSigned: waiverSigned || false,
        waiverSignedAt: waiverSigned ? new Date() : null,
        promoCode: promoCode?.toUpperCase() || null,
        promoDiscountCents,
        leadSource: leadSource?.trim() || null,
      },
    });

    // Send confirmation email to applicant
    sendEnrollmentConfirmationEmail({
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      planName,
    }).catch(() => {});

    return NextResponse.json({ success: true, id: submission.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating enrollment:", error);
    return new NextResponse("Failed to submit enrollment", { status: 500 });
  }
}
