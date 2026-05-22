import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { canAddMember } from "@/lib/trial";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

async function getNextMemberNumber(): Promise<number> {
  const lastMember = await prisma.member.findFirst({
    orderBy: { memberNumber: "desc" },
    select: { memberNumber: true },
  });
  return lastMember?.memberNumber
    ? Number(lastMember.memberNumber) + 1
    : 10000001;
}


// POST /api/public/waiver-submit
// Handles both adult and guardian waiver submissions
export async function POST(req: Request) {
  try {
    // Public form — throttle hard so spam/abuse can't flood the members table.
    const ip = getClientIp(req);
    const { limited } = rateLimit(`waiver-submit:${ip}`, 10, 60 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const clientId = await getClientId(req);
    const body = await req.json();
    const { type = "adult" } = body;

    if (type === "guardian") {
      return handleGuardianSubmit(body, clientId);
    }
    return handleAdultSubmit(body, clientId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error submitting waiver:", msg, error);
    return NextResponse.json({ error: `Failed to submit waiver: ${msg}` }, { status: 500 });
  }
}

async function handleAdultSubmit(body: Record<string, string>, clientId: string) {
  const { existingMemberId, firstName, lastName, email, phone, dateOfBirth, address, city, state, zipCode, emergencyContactName, emergencyContactPhone, medicalNotes, pdfBase64, templateSlug, templateId } = body;
  const resolvedTemplate = await resolveTemplate(clientId, templateId, templateSlug);

  // Two modes: admin-emailed re-sign (existingMemberId set, attach to that
  // member) vs new public sign (existingMemberId blank, create a new member).
  if (existingMemberId) {
    const existing = await prisma.member.findFirst({
      where: { id: existingMemberId, clientId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Patch the member with any field updates the signer entered.
    await prisma.member.update({
      where: { id: existing.id },
      data: {
        ...(firstName ? { firstName: firstName.trim() } : {}),
        ...(lastName ? { lastName: lastName.trim() } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
        ...(state !== undefined ? { state: state || null } : {}),
        ...(zipCode !== undefined ? { zipCode: zipCode || null } : {}),
        ...(emergencyContactName !== undefined ? { emergencyContactName: emergencyContactName || null } : {}),
        ...(emergencyContactPhone !== undefined ? { emergencyContactPhone: emergencyContactPhone || null } : {}),
        ...(medicalNotes !== undefined ? { medicalNotes: medicalNotes || null } : {}),
        waiverSigned: true,
        waiverSignedAt: new Date(),
      },
    });

    // Additive: every re-sign creates a new SignedWaiver row, never
    // replaces existing ones (audit trail).
    await prisma.signedWaiver.create({
      data: {
        memberId: existing.id,
        templateId: resolvedTemplate?.id || null,
        templateName: resolvedTemplate?.name || "Waiver",
        waiverContent: "Submitted via waiver form",
        signatureData: body.signatureData || "submitted",
        pdfData: pdfBase64 || null,
        confirmed: false,
        clientId,
      },
    });

    return NextResponse.json({ member: { id: existing.id } }, { status: 200 });
  }

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }

  const memberCheck = await canAddMember(clientId);
  if (!memberCheck.allowed) {
    return NextResponse.json({ error: memberCheck.reason }, { status: 403 });
  }

  const memberNumber = await getNextMemberNumber();

  const member = await prisma.member.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email || null,
      phone: phone || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      medicalNotes: medicalNotes || null,
      waiverSigned: false,
      status: "PROSPECT",
      memberNumber,
      clientId,
    },
  });

  // Create SignedWaiver in pending (unconfirmed) state. SignedWaiver is
  // the source of truth — we no longer also write to member.styleDocuments
  // (that double-listed the same waiver on the portal Documents tab).
  await prisma.signedWaiver.create({
    data: {
      memberId: member.id,
      templateId: resolvedTemplate?.id || null,
      templateName: resolvedTemplate?.name || "Waiver",
      waiverContent: "Submitted via waiver form",
      signatureData: body.signatureData || "submitted",
      pdfData: pdfBase64 || null,
      confirmed: false,
      clientId,
    },
  });

  return NextResponse.json({ member: { id: member.id } }, { status: 201 });
}

// Resolve which WaiverTemplate this submission came from. Prefer the id
// the client sent (cheap, exact match); fall back to slug lookup. Returns
// null when neither is present or matches — that's fine, the waiver is
// stored without a template link.
async function resolveTemplate(
  clientId: string,
  templateId?: string,
  templateSlug?: string,
): Promise<{ id: string; name: string } | null> {
  if (templateId) {
    const t = await prisma.waiverTemplate.findFirst({
      where: { id: templateId, clientId },
      select: { id: true, name: true },
    });
    if (t) return t;
  }
  if (templateSlug) {
    const t = await prisma.waiverTemplate.findFirst({
      where: { clientId, slug: templateSlug },
      select: { id: true, name: true },
    });
    if (t) return t;
  }
  return null;
}

async function handleGuardianSubmit(body: Record<string, string>, clientId: string) {
  const {
    dependentFirstName, dependentLastName, dependentEmail, dependentDateOfBirth,
    guardianFirstName, guardianLastName, guardianDateOfBirth, relationship,
    email, phone, address, city, state, zipCode,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    dependentEmergencyContactName, dependentEmergencyContactPhone, dependentEmergencyContactRelationship,
    medicalNotes, pdfBase64, parentPdfBase64, templateSlug, templateId,
  } = body;
  const resolvedTemplate = await resolveTemplate(clientId, templateId, templateSlug);

  if (!dependentFirstName || !dependentLastName) {
    return NextResponse.json({ error: "Dependent first and last name are required" }, { status: 400 });
  }

  // Create dependent (minor) member — inherits the shared household info
  // (phone, address, emergency contact) so admins don't have to re-enter it.
  const depNumber = await getNextMemberNumber();
  const dependent = await prisma.member.create({
    data: {
      firstName: dependentFirstName.trim(),
      lastName: dependentLastName.trim(),
      email: dependentEmail || null,
      phone: phone || null,
      dateOfBirth: dependentDateOfBirth ? new Date(dependentDateOfBirth) : null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      parentGuardianName: `${guardianFirstName || ""} ${guardianLastName || ""}`.trim() || null,
      // Dependent's emergency contact — may be the same person as the
      // guardian's contact (form sends the guardian's name/phone in that
      // case) but the relationship is always the dependent's (e.g. "Aunt").
      emergencyContactName: dependentEmergencyContactName || emergencyContactName || null,
      emergencyContactPhone: dependentEmergencyContactPhone || emergencyContactPhone || null,
      emergencyContactRelationship: dependentEmergencyContactRelationship || null,
      medicalNotes: medicalNotes || null,
      waiverSigned: false,
      status: "PROSPECT",
      memberNumber: depNumber,
      clientId,
    },
  });

  // Create SignedWaiver on the CHILD. Same PDF (signature) gets attached
  // separately to the parent below so each account has its own row — that
  // way each profile renders its waiver. We used to skip the parent copy
  // and rely on the portal's minor-child aggregation alone, but that
  // missed the parent's admin profile + the portal's "own waivers" tab,
  // so the waiver appeared nowhere on the parent's account.
  //
  // Single confirmation: the /api/waivers/confirm/[id] route already
  // cascade-confirms paired rows within a 30s signedAt window, so admin
  // only ever clicks once.
  await prisma.signedWaiver.create({
    data: {
      memberId: dependent.id,
      templateId: resolvedTemplate?.id || null,
      templateName: resolvedTemplate?.name || "Waiver",
      waiverContent: "Submitted via guardian waiver form",
      signatureData: body.signatureData || "submitted",
      pdfData: pdfBase64 || null,
      confirmed: false,
      clientId,
    },
  });

  // Create guardian member — inherits the same household info and a copy
  // of the medical / emergency-contact details so it shows up on both
  // profiles.
  if (guardianFirstName && guardianLastName) {
    const guardianNumber = await getNextMemberNumber();
    const guardian = await prisma.member.create({
      data: {
        firstName: guardianFirstName.trim(),
        lastName: guardianLastName.trim(),
        dateOfBirth: guardianDateOfBirth ? new Date(guardianDateOfBirth) : null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        // Guardian's emergency contact + relationship label scoped to the guardian.
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        emergencyContactRelationship: emergencyContactRelationship || null,
        medicalNotes: medicalNotes || null,
        status: "PARENT",
        memberNumber: guardianNumber,
        clientId,
      },
    });

    // Create relationship
    const relationshipType = relationship === "Legal Guardian" ? "Guardian of" : "Parent of";
    await prisma.memberRelationship.create({
      data: {
        fromMemberId: guardian.id,
        toMemberId: dependent.id,
        relationship: relationshipType,
      },
    });

    // Parent's own SignedWaiver — its own PDF formatted like the standard
    // adult waiver (no dependent info), so the parent's account shows a
    // proper personal waiver instead of a copy of the child's PDF. Falls
    // back to the child's PDF for older clients that don't send a
    // parentPdfBase64 yet. Paired with the child's row by (relationship +
    // signedAt within 30s) on confirmation.
    await prisma.signedWaiver.create({
      data: {
        memberId: guardian.id,
        templateId: resolvedTemplate?.id || null,
        templateName: resolvedTemplate?.name || "Waiver",
        waiverContent: "Submitted via guardian waiver form (parent copy)",
        signatureData: body.signatureData || "submitted",
        pdfData: parentPdfBase64 || pdfBase64 || null,
        confirmed: false,
        clientId,
      },
    });
  }

  return NextResponse.json({ member: { id: dependent.id } }, { status: 201 });
}
