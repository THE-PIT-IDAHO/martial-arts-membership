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

type GuardianChildPayload = {
  existingChildMemberId?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  medicalNotes?: string;
  pdfBase64?: string;
};

async function handleGuardianSubmit(body: Record<string, unknown>, clientId: string) {
  const {
    guardianFirstName, guardianLastName, guardianDateOfBirth, relationship,
    email, phone, address, city, state, zipCode,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    parentPdfBase64, templateSlug, templateId, existingParentMemberId,
  } = body as Record<string, string | undefined>;

  // Accept the new children[] payload. Fall back to building a single-
  // element array from the legacy dependent* fields so older stale tabs
  // don't 400 after a deploy.
  let children: GuardianChildPayload[] = Array.isArray(body.children)
    ? (body.children as GuardianChildPayload[])
    : [];
  if (children.length === 0 && typeof body.dependentFirstName === "string") {
    const legacy = body as Record<string, string | undefined>;
    children = [{
      existingChildMemberId: legacy.existingChildMemberId,
      firstName: legacy.dependentFirstName,
      lastName: legacy.dependentLastName,
      dateOfBirth: legacy.dependentDateOfBirth,
      email: legacy.dependentEmail,
      emergencyContactName: legacy.dependentEmergencyContactName || legacy.emergencyContactName,
      emergencyContactPhone: legacy.dependentEmergencyContactPhone || legacy.emergencyContactPhone,
      emergencyContactRelationship: legacy.dependentEmergencyContactRelationship,
      medicalNotes: legacy.medicalNotes,
      pdfBase64: legacy.pdfBase64,
    }];
  }

  if (children.length === 0) {
    return NextResponse.json({ error: "At least one child is required" }, { status: 400 });
  }
  for (const c of children) {
    if (!c.firstName || !c.lastName) {
      return NextResponse.json({ error: "Each child needs a first and last name" }, { status: 400 });
    }
  }

  const resolvedTemplate = await resolveTemplate(clientId, templateId, templateSlug);
  const signatureData = (typeof body.signatureData === "string" ? body.signatureData : null) || "submitted";

  // Resolve the parent FIRST so we have an ID to link every child to.
  let guardian: { id: string } | null = null;
  if (existingParentMemberId) {
    const found = await prisma.member.findFirst({
      where: { id: existingParentMemberId, clientId },
    });
    if (!found) {
      return NextResponse.json({ error: "Existing parent not found" }, { status: 404 });
    }
    await prisma.member.update({
      where: { id: found.id },
      data: {
        ...(guardianFirstName ? { firstName: guardianFirstName.trim() } : {}),
        ...(guardianLastName ? { lastName: guardianLastName.trim() } : {}),
        ...(guardianDateOfBirth ? { dateOfBirth: new Date(guardianDateOfBirth) } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
        ...(state !== undefined ? { state: state || null } : {}),
        ...(zipCode !== undefined ? { zipCode: zipCode || null } : {}),
        ...(emergencyContactName !== undefined ? { emergencyContactName: emergencyContactName || null } : {}),
        ...(emergencyContactPhone !== undefined ? { emergencyContactPhone: emergencyContactPhone || null } : {}),
        ...(emergencyContactRelationship !== undefined ? { emergencyContactRelationship: emergencyContactRelationship || null } : {}),
        waiverSigned: true,
        waiverSignedAt: new Date(),
      },
    });
    guardian = { id: found.id };
  } else if (guardianFirstName && guardianLastName) {
    const guardianNumber = await getNextMemberNumber();
    const created = await prisma.member.create({
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
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        emergencyContactRelationship: emergencyContactRelationship || null,
        status: "PARENT",
        memberNumber: guardianNumber,
        clientId,
      },
    });
    guardian = { id: created.id };
  }

  // Resolve each child + create their SignedWaiver. Ensure a relationship
  // back to the guardian if we have one. Each child carries its own PDF.
  const relationshipType = relationship === "Legal Guardian" ? "Guardian of" : "Parent of";
  const dependentIds: string[] = [];
  for (const c of children) {
    let dependentId: string;
    if (c.existingChildMemberId) {
      const found = await prisma.member.findFirst({
        where: { id: c.existingChildMemberId, clientId },
      });
      if (!found) {
        return NextResponse.json({ error: "Existing child not found" }, { status: 404 });
      }
      await prisma.member.update({
        where: { id: found.id },
        data: {
          ...(c.firstName ? { firstName: c.firstName.trim() } : {}),
          ...(c.lastName ? { lastName: c.lastName.trim() } : {}),
          ...(c.dateOfBirth ? { dateOfBirth: new Date(c.dateOfBirth) } : {}),
          ...(c.email !== undefined ? { email: c.email || null } : {}),
          ...(c.emergencyContactName !== undefined ? { emergencyContactName: c.emergencyContactName || null } : {}),
          ...(c.emergencyContactPhone !== undefined ? { emergencyContactPhone: c.emergencyContactPhone || null } : {}),
          ...(c.emergencyContactRelationship !== undefined ? { emergencyContactRelationship: c.emergencyContactRelationship || null } : {}),
          ...(c.medicalNotes !== undefined ? { medicalNotes: c.medicalNotes || null } : {}),
          waiverSigned: true,
          waiverSignedAt: new Date(),
        },
      });
      dependentId = found.id;
    } else {
      const depNumber = await getNextMemberNumber();
      const created = await prisma.member.create({
        data: {
          firstName: (c.firstName || "").trim(),
          lastName: (c.lastName || "").trim(),
          email: c.email || null,
          phone: phone || null,
          dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth) : null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          parentGuardianName: `${guardianFirstName || ""} ${guardianLastName || ""}`.trim() || null,
          emergencyContactName: c.emergencyContactName || emergencyContactName || null,
          emergencyContactPhone: c.emergencyContactPhone || emergencyContactPhone || null,
          emergencyContactRelationship: c.emergencyContactRelationship || null,
          medicalNotes: c.medicalNotes || null,
          waiverSigned: false,
          status: "PROSPECT",
          memberNumber: depNumber,
          clientId,
        },
      });
      dependentId = created.id;
    }

    await prisma.signedWaiver.create({
      data: {
        memberId: dependentId,
        templateId: resolvedTemplate?.id || null,
        templateName: resolvedTemplate?.name || "Waiver",
        waiverContent: "Submitted via guardian waiver form",
        signatureData,
        pdfData: c.pdfBase64 || null,
        confirmed: false,
        clientId,
      },
    });

    if (guardian) {
      const existingRel = await prisma.memberRelationship.findFirst({
        where: { fromMemberId: guardian.id, toMemberId: dependentId },
      });
      if (!existingRel) {
        await prisma.memberRelationship.create({
          data: {
            fromMemberId: guardian.id,
            toMemberId: dependentId,
            relationship: relationshipType,
          },
        });
      }
    }
    dependentIds.push(dependentId);
  }

  // One parent SignedWaiver total — the parent signed once even though it
  // may cover multiple kids.
  if (guardian) {
    await prisma.signedWaiver.create({
      data: {
        memberId: guardian.id,
        templateId: resolvedTemplate?.id || null,
        templateName: resolvedTemplate?.name || "Waiver",
        waiverContent: "Submitted via guardian waiver form (parent copy)",
        signatureData,
        pdfData: (typeof parentPdfBase64 === "string" ? parentPdfBase64 : null)
          || (children[0]?.pdfBase64 || null),
        confirmed: false,
        clientId,
      },
    });
  }

  return NextResponse.json(
    { member: { id: dependentIds[0] }, dependentIds },
    { status: 201 },
  );
}
