// GET /api/public/member-info?memberId=...
//
// Public-facing endpoint that returns just the fields the waiver sign page
// needs to pre-fill its form. Parallels /api/public/parent-info but with
// the broader set of fields the adult waiver form expects.
//
// The memberId is unguessable (cuid), so it acts as a soft access token —
// same trust model the existing send-link email flow already uses. We
// deliberately omit anything financial, internal-only, or note-y.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
      email: true,
      parentGuardianName: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelationship: true,
      medicalNotes: true,
      waiverSigned: true,
      waiverSignedAt: true,
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ member });
}
