import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/enrollment-submissions/:id
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { action, notes } = body; // action: "approve" | "reject"

    const submission = await prisma.enrollmentSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "approve") {
      const clientId = await getClientId(req);

      // Create the member
      const member = await prisma.member.create({
        data: {
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          phone: submission.phone,
          dateOfBirth: submission.dateOfBirth,
          address: submission.address,
          city: submission.city,
          state: submission.state,
          zipCode: submission.zipCode,
          emergencyContactName: submission.emergencyContactName,
          emergencyContactPhone: submission.emergencyContactPhone,
          parentGuardianName: submission.parentGuardianName,
          medicalNotes: submission.medicalNotes,
          waiverSigned: submission.waiverSigned,
          waiverSignedAt: submission.waiverSignedAt,
          status: "ACTIVE",
          clientId,
        },
      });

      // Create membership if plan selected
      if (submission.selectedPlanId) {
        const plan = await prisma.membershipPlan.findUnique({
          where: { id: submission.selectedPlanId },
        });

        if (plan) {
          await prisma.membership.create({
            data: {
              memberId: member.id,
              membershipPlanId: plan.id,
              startDate: new Date(),
              status: "ACTIVE",
              nextPaymentDate: new Date(),
            },
          });
        }
      }

      // Update submission
      await prisma.enrollmentSubmission.update({
        where: { id },
        data: {
          status: "APPROVED",
          memberId: member.id,
          notes: notes || null,
        },
      });

      // Send welcome email
      sendWelcomeEmail({
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
      }).catch(() => {});

      return NextResponse.json({ success: true, memberId: member.id });
    }

    if (action === "reject") {
      await prisma.enrollmentSubmission.update({
        where: { id },
        data: { status: "REJECTED", notes: notes || null },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error updating enrollment:", error);
    return new NextResponse("Failed to update enrollment", { status: 500 });
  }
}
