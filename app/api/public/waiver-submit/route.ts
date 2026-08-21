import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { canAddMember } from "@/lib/trial";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { checkEmailAvailable, normalizeEmail } from "@/lib/member-email";
import { getNextMemberNumber } from "@/lib/sequence";
import { sendWaiverReceivedEmail } from "@/lib/notifications";

/** Fire the "waiver received" acknowledgment and AWAIT it. Vercel
 *  serverless kills the function process the instant the response is
 *  sent, so any dangling promise (the old fire-and-forget pattern)
 *  gets terminated mid-flight -- you see the "start" log line then
 *  nothing, no email, no error. Awaiting adds a few hundred ms to
 *  the response but makes the send actually complete. Errors are
 *  caught locally so a Resend outage never fails the waiver-submit
 *  response itself. */
async function fireWaiverAck(params: {
  email: string | null | undefined;
  firstName: string | null | undefined;
  memberId: string;
  clientId: string;
  // Signed waiver PDF (base64) + display filename. Attached to the
  // ack email so the recipient has the document for their records.
  // Both optional -- if missing, the email still sends without an
  // attachment (some flows -- like an admin re-sign with just a
  // signature scribble -- don't have a PDF to attach).
  pdfBase64?: string | null;
  fileName?: string | null;
}) {
  if (!params.email) return;
  try {
    await sendWaiverReceivedEmail({
      email: params.email,
      firstName: params.firstName || "there",
      memberId: params.memberId,
      clientId: params.clientId,
      pdfBase64: stripDataUri(params.pdfBase64),
      fileName: params.fileName,
    });
  } catch (err) {
    console.error("[waiver-submit] acknowledgment email failed:", err);
  }
}

/** Data URLs prefix the base64 with "data:application/pdf;base64," --
 *  strip that so Resend doesn't reject the attachment. Safe to call
 *  on values that don't have the prefix. */
function stripDataUri(s: string | null | undefined): string | null {
  if (!s) return null;
  const comma = s.indexOf(",");
  return comma >= 0 && s.slice(0, comma).includes(";base64") ? s.slice(comma + 1) : s;
}

/** Build a clean, human-readable filename for the attached waiver
 *  PDF, e.g. "Waiver - John Smith - General Waiver.pdf". */
function waiverFileName(firstName: string | null | undefined, lastName: string | null | undefined, templateName: string): string {
  const who = `${firstName || ""} ${lastName || ""}`.trim() || "Member";
  return `Waiver - ${who} - ${templateName}.pdf`;
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
    let emailUpdate: { email: string | null } | null = null;
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      const emailCheck = await checkEmailAvailable({
        email: normalizedEmail,
        clientId,
        excludeMemberId: existing.id,
      });
      if (!emailCheck.ok) {
        return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
      }
      emailUpdate = { email: normalizedEmail };
    }

    await prisma.member.update({
      where: { id: existing.id },
      data: {
        ...(firstName ? { firstName: firstName.trim() } : {}),
        ...(lastName ? { lastName: lastName.trim() } : {}),
        ...(emailUpdate || {}),
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
        confirmed: true,
        confirmedAt: new Date(),
        clientId,
      },
    });

    // Ack the re-signer at whatever email they just entered (falls
    // back to whatever's on file). Only skips when we truly have no
    // address to send to.
    const ackEmail = (emailUpdate?.email) ?? existing.email;
    const ackFirstName = firstName?.trim() || existing.firstName;
    await fireWaiverAck({
      email: ackEmail,
      firstName: ackFirstName,
      memberId: existing.id,
      clientId,
      pdfBase64: pdfBase64 || null,
      fileName: waiverFileName(ackFirstName, lastName?.trim() || existing.lastName, resolvedTemplate?.name || "Waiver"),
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

  const memberNumber = await getNextMemberNumber(clientId);

  const normalizedEmail = normalizeEmail(email);
  const emailCheck = await checkEmailAvailable({ email: normalizedEmail, clientId });
  if (!emailCheck.ok) {
    return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
  }

  const now = new Date();
  const member = await prisma.member.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: phone || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      medicalNotes: medicalNotes || null,
      // Waivers auto-confirm on submit -- flag the member as signed
      // right away so downstream reads (Waivers page counts, member
      // profile "waiver on file" badge) light up immediately.
      waiverSigned: true,
      waiverSignedAt: now,
      status: "PROSPECT",
      memberNumber,
      clientId,
    },
  });

  // SignedWaiver is created in auto-confirmed state -- admin no
  // longer needs to approve. SignedWaiver is the source of truth for
  // the documents tab; we don't also write to member.styleDocuments
  // (that used to double-list the same waiver).
  await prisma.signedWaiver.create({
    data: {
      memberId: member.id,
      templateId: resolvedTemplate?.id || null,
      templateName: resolvedTemplate?.name || "Waiver",
      waiverContent: "Submitted via waiver form",
      signatureData: body.signatureData || "submitted",
      pdfData: pdfBase64 || null,
      confirmed: true,
      confirmedAt: now,
      clientId,
    },
  });

  await fireWaiverAck({
    email: normalizedEmail,
    firstName: firstName.trim(),
    memberId: member.id,
    clientId,
    pdfBase64: pdfBase64 || null,
    fileName: waiverFileName(firstName.trim(), lastName.trim(), resolvedTemplate?.name || "Waiver"),
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
    let emailUpdate: { email: string | null } | null = null;
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      const emailCheck = await checkEmailAvailable({
        email: normalizedEmail,
        clientId,
        excludeMemberId: found.id,
      });
      if (!emailCheck.ok) {
        return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
      }
      emailUpdate = { email: normalizedEmail };
    }

    await prisma.member.update({
      where: { id: found.id },
      data: {
        ...(guardianFirstName ? { firstName: guardianFirstName.trim() } : {}),
        ...(guardianLastName ? { lastName: guardianLastName.trim() } : {}),
        ...(guardianDateOfBirth ? { dateOfBirth: new Date(guardianDateOfBirth) } : {}),
        ...(emailUpdate || {}),
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
    const guardianNumber = await getNextMemberNumber(clientId);
    const normalizedGuardianEmail = normalizeEmail(email);
    const guardianEmailCheck = await checkEmailAvailable({
      email: normalizedGuardianEmail,
      clientId,
    });
    if (!guardianEmailCheck.ok) {
      return NextResponse.json({ error: guardianEmailCheck.reason }, { status: 409 });
    }
    const created = await prisma.member.create({
      data: {
        firstName: guardianFirstName.trim(),
        lastName: guardianLastName.trim(),
        dateOfBirth: guardianDateOfBirth ? new Date(guardianDateOfBirth) : null,
        email: normalizedGuardianEmail,
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
      let childEmailUpdate: { email: string | null } | null = null;
      if (c.email !== undefined) {
        const normalizedChildEmail = normalizeEmail(c.email);
        const childEmailCheck = await checkEmailAvailable({
          email: normalizedChildEmail,
          clientId,
          excludeMemberId: found.id,
          // The guardian is part of the same submission — sharing email
          // with them is the expected "kid uses parent's email" case.
          allowedRelatedMemberIds: guardian ? [guardian.id] : undefined,
        });
        if (!childEmailCheck.ok) {
          return NextResponse.json({ error: childEmailCheck.reason }, { status: 409 });
        }
        childEmailUpdate = { email: normalizedChildEmail };
      }

      await prisma.member.update({
        where: { id: found.id },
        data: {
          ...(c.firstName ? { firstName: c.firstName.trim() } : {}),
          ...(c.lastName ? { lastName: c.lastName.trim() } : {}),
          ...(c.dateOfBirth ? { dateOfBirth: new Date(c.dateOfBirth) } : {}),
          ...(childEmailUpdate || {}),
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
      const depNumber = await getNextMemberNumber(clientId);
      const normalizedNewChildEmail = normalizeEmail(c.email);
      const newChildEmailCheck = await checkEmailAvailable({
        email: normalizedNewChildEmail,
        clientId,
        allowedRelatedMemberIds: guardian ? [guardian.id] : undefined,
      });
      if (!newChildEmailCheck.ok) {
        return NextResponse.json({ error: newChildEmailCheck.reason }, { status: 409 });
      }
      const created = await prisma.member.create({
        data: {
          firstName: (c.firstName || "").trim(),
          lastName: (c.lastName || "").trim(),
          email: normalizedNewChildEmail,
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
          // Auto-confirmed on submit -- matches the adult flow.
          waiverSigned: true,
          waiverSignedAt: new Date(),
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
        confirmed: true,
        confirmedAt: new Date(),
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
        confirmed: true,
        confirmedAt: new Date(),
        clientId,
      },
    });

    // Ack the guardian ONCE for the whole submission, no matter how
    // many kids were on it. Look up the guardian's email + first
    // name fresh so we handle both the "existing parent" and
    // "brand-new parent" branches without threading them through.
    // Parent PDF preferred; falls back to the first child's PDF if
    // no dedicated parent copy was included in the submission.
    const guardianRow = await prisma.member.findUnique({
      where: { id: guardian.id },
      select: { email: true, firstName: true, lastName: true },
    });
    const guardianPdf =
      (typeof parentPdfBase64 === "string" ? parentPdfBase64 : null)
      || (children[0]?.pdfBase64 || null);
    await fireWaiverAck({
      email: guardianRow?.email,
      firstName: guardianRow?.firstName,
      memberId: guardian.id,
      clientId,
      pdfBase64: guardianPdf,
      fileName: waiverFileName(
        guardianRow?.firstName,
        guardianRow?.lastName,
        resolvedTemplate?.name || "Waiver",
      ),
    });
  }

  return NextResponse.json(
    { member: { id: dependentIds[0] }, dependentIds },
    { status: 201 },
  );
}
