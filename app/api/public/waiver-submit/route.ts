import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

async function getNextMemberNumber(): Promise<number> {
  const lastMember = await prisma.member.findFirst({
    orderBy: { memberNumber: "desc" },
    select: { memberNumber: true },
  });
  return lastMember?.memberNumber
    ? Number(lastMember.memberNumber) + 1
    : 10000001;
}

const PDF_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjNDExMTEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjhsLTYtNnoiLz48cGF0aCBkPSJNMTQgMnY2aDYiLz48cGF0aCBkPSJNMTAgOWgtNiIvPjxwYXRoIGQ9Ik0xMCAxM2gtNiIvPjxwYXRoIGQ9Ik0xMCAxN2gtNiIvPjwvc3ZnPg==";

async function savePdfToMember(memberId: string, pdfBase64: string) {
  const docEntry = {
    id: `waiver-${Date.now()}`,
    name: "Signed Waiver",
    url: pdfBase64,
    thumbnail: PDF_ICON,
    uploadedAt: new Date().toISOString(),
  };
  await prisma.member.update({
    where: { id: memberId },
    data: { styleDocuments: JSON.stringify([docEntry]) },
  });
}

// POST /api/public/waiver-submit
// Handles both adult and guardian waiver submissions
export async function POST(req: Request) {
  try {
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
  const { firstName, lastName, email, phone, dateOfBirth, address, city, state, zipCode, emergencyContactName, emergencyContactPhone, medicalNotes, pdfBase64 } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
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

  // Create SignedWaiver in pending (unconfirmed) state
  await prisma.signedWaiver.create({
    data: {
      memberId: member.id,
      templateName: "Public Waiver",
      waiverContent: "Submitted via public waiver form",
      signatureData: body.signatureData || "submitted",
      pdfData: pdfBase64 || null,
      confirmed: false,
      clientId,
    },
  });

  if (pdfBase64) await savePdfToMember(member.id, pdfBase64);

  return NextResponse.json({ member: { id: member.id } }, { status: 201 });
}

async function handleGuardianSubmit(body: Record<string, string>, clientId: string) {
  const {
    dependentFirstName, dependentLastName, dependentEmail, dependentDateOfBirth,
    guardianFirstName, guardianLastName, relationship,
    email, phone, address, city, state, zipCode,
    emergencyContactName, emergencyContactPhone,
    medicalNotes, pdfBase64,
  } = body;

  if (!dependentFirstName || !dependentLastName) {
    return NextResponse.json({ error: "Dependent first and last name are required" }, { status: 400 });
  }

  // Create dependent (minor) member
  const depNumber = await getNextMemberNumber();
  const dependent = await prisma.member.create({
    data: {
      firstName: dependentFirstName.trim(),
      lastName: dependentLastName.trim(),
      email: dependentEmail || null,
      dateOfBirth: dependentDateOfBirth ? new Date(dependentDateOfBirth) : null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      parentGuardianName: `${guardianFirstName || ""} ${guardianLastName || ""}`.trim() || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      medicalNotes: medicalNotes || null,
      waiverSigned: false,
      status: "PROSPECT",
      memberNumber: depNumber,
      clientId,
    },
  });

  // Create SignedWaiver in pending (unconfirmed) state
  await prisma.signedWaiver.create({
    data: {
      memberId: dependent.id,
      templateName: "Public Waiver (Guardian)",
      waiverContent: "Submitted via public guardian waiver form",
      signatureData: body.signatureData || "submitted",
      pdfData: pdfBase64 || null,
      confirmed: false,
      clientId,
    },
  });

  if (pdfBase64) await savePdfToMember(dependent.id, pdfBase64);

  // Create guardian member
  if (guardianFirstName && guardianLastName) {
    const guardianNumber = await getNextMemberNumber();
    const guardian = await prisma.member.create({
      data: {
        firstName: guardianFirstName.trim(),
        lastName: guardianLastName.trim(),
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
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
  }

  return NextResponse.json({ member: { id: dependent.id } }, { status: 201 });
}
