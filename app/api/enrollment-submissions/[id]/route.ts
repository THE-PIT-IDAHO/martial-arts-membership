import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";
import { checkEmailAvailable, normalizeEmail } from "@/lib/member-email";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/enrollment-submissions/:id
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { action, notes } = body; // action: "approve" | "reject"
    const clientId = await getClientId(req);

    // Tenant verify — without this, any gym's admin could approve/reject
    // another gym's pending enrollments.
    const submission = await prisma.enrollmentSubmission.findUnique({
      where: { id },
    });
    if (!submission || submission.clientId !== clientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "approve") {
      // Reject the approval if the submitted email collides with an
      // unrelated existing member. Admin can resolve the conflict on
      // the submission (or link the families) and re-approve.
      const normalizedEmail = normalizeEmail(submission.email);
      const emailCheck = await checkEmailAvailable({ email: normalizedEmail, clientId });
      if (!emailCheck.ok) {
        return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
      }

      // Create the member
      const member = await prisma.member.create({
        data: {
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: normalizedEmail,
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

      // Create membership if plan selected (scoped to tenant so a stale
      // selectedPlanId can't grab another gym's plan).
      if (submission.selectedPlanId) {
        const plan = await prisma.membershipPlan.findFirst({
          where: { id: submission.selectedPlanId, clientId },
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
