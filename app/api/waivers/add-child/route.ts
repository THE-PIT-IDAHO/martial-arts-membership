import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAddMember } from "@/lib/trial";
import { logAudit } from "@/lib/audit";

async function getNextMemberNumber(): Promise<number> {
  const lastMember = await prisma.member.findFirst({
    orderBy: { memberNumber: "desc" },
    select: { memberNumber: true },
  });
  return lastMember?.memberNumber ? Number(lastMember.memberNumber) + 1 : 10000001;
}

// POST /api/waivers/add-child
// Public endpoint. Parent (identified by parentMemberId) signs a waiver to add a new
// child to their account. Creates the child Member, the relationship, a SignedWaiver
// for the child, and refreshes a SignedWaiver on the parent so their waiver on file
// reflects the updated family.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      parentMemberId,
      childFirstName,
      childLastName,
      childDateOfBirth,
      childEmail,
      childMedicalNotes,
      relationship,
      signatureData,
      waiverContent,
      templateName,
    } = body as Record<string, string>;

    if (!parentMemberId) {
      return NextResponse.json({ error: "parentMemberId is required" }, { status: 400 });
    }
    if (!childFirstName || !childLastName) {
      return NextResponse.json({ error: "Child first and last name are required" }, { status: 400 });
    }
    if (!signatureData) {
      return NextResponse.json({ error: "Signature is required" }, { status: 400 });
    }

    const parent = await prisma.member.findUnique({
      where: { id: parentMemberId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clientId: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        phone: true,
        email: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
      },
    });
    if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 404 });

    const memberCheck = await canAddMember(parent.clientId);
    if (!memberCheck.allowed) {
      return NextResponse.json({ error: memberCheck.reason }, { status: 403 });
    }

    const childNumber = await getNextMemberNumber();
    const parentName = `${parent.firstName} ${parent.lastName}`.trim();

    const child = await prisma.member.create({
      data: {
        firstName: childFirstName.trim(),
        lastName: childLastName.trim(),
        email: childEmail || null,
        dateOfBirth: childDateOfBirth ? new Date(childDateOfBirth) : null,
        address: parent.address,
        city: parent.city,
        state: parent.state,
        zipCode: parent.zipCode,
        parentGuardianName: parentName || null,
        emergencyContactName: parent.emergencyContactName,
        emergencyContactPhone: parent.emergencyContactPhone,
        medicalNotes: childMedicalNotes || null,
        waiverSigned: true,
        waiverSignedAt: new Date(),
        status: "PROSPECT",
        memberNumber: childNumber,
        clientId: parent.clientId,
      },
    });

    const relName = relationship?.trim() || "Parent of";
    await prisma.memberRelationship.create({
      data: {
        fromMemberId: parent.id,
        toMemberId: child.id,
        relationship: relName,
      },
    });

    const finalTemplateName = templateName || "Liability Waiver (Guardian)";
    const finalContent = waiverContent || "Standard liability waiver";

    // SignedWaiver for the child
    await prisma.signedWaiver.create({
      data: {
        memberId: child.id,
        templateName: finalTemplateName,
        waiverContent: finalContent,
        signatureData,
        confirmed: false,
        clientId: parent.clientId,
      },
    });

    // Refresh / update the parent's waiver on file so it reflects the new family member
    await prisma.signedWaiver.create({
      data: {
        memberId: parent.id,
        templateName: finalTemplateName,
        waiverContent: `${finalContent}\n\n(Updated to add minor: ${childFirstName} ${childLastName})`,
        signatureData,
        confirmed: false,
        clientId: parent.clientId,
      },
    });
    await prisma.member.update({
      where: { id: parent.id },
      data: { waiverSigned: true, waiverSignedAt: new Date() },
    });

    logAudit({
      entityType: "Member",
      entityId: child.id,
      action: "CREATE",
      summary: `Child ${childFirstName} ${childLastName} added under parent ${parentName}; waiver signed`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      child: { id: child.id, memberNumber: child.memberNumber },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("add-child error:", msg, err);
    return NextResponse.json({ error: `Failed to add child: ${msg}` }, { status: 500 });
  }
}
