// GET /api/public/linked-children?parentMemberId=...
//
// Used by the public guardian waiver form (admin "Add Child" flow) to
// populate the existing-child dropdown. Returns minimal info — id, name,
// DOB — for every member linked to the parent via a "Parent of" or
// "Guardian of" relationship. Same trust model as the rest of the public
// member-by-id endpoints: the parentMemberId is unguessable.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const parentMemberId = req.nextUrl.searchParams.get("parentMemberId");
  if (!parentMemberId) {
    return NextResponse.json({ error: "parentMemberId required" }, { status: 400 });
  }

  const rels = await prisma.memberRelationship.findMany({
    where: { fromMemberId: parentMemberId },
    select: {
      relationship: true,
      toMember: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          email: true,
          phone: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          emergencyContactRelationship: true,
          medicalNotes: true,
        },
      },
    },
  });

  // Keep only parent/guardian-style links so spouses, siblings, etc. don't
  // pollute the dropdown.
  const children = rels
    .filter((r) => {
      const lower = (r.relationship || "").toLowerCase();
      return lower.includes("parent") || lower.includes("guardian");
    })
    .map((r) => r.toMember);

  return NextResponse.json({ children });
}
