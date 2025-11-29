// app/api/members/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// GET /api/members/:id
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        attendances: {
          where: {
            confirmed: true, // Only include confirmed attendance for requirement counting
          },
          include: {
            classSession: {
              select: {
                id: true,
                name: true,
                classType: true,
                styleName: true,
                styleNames: true,
                program: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ member });
  } catch (err) {
    console.error(`GET /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to load member profile" },
      { status: 500 }
    );
  }
}

// PATCH /api/members/:id
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));

    const {
      firstName,
      lastName,
      email,
      phone,
      status,

      dateOfBirth,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      parentGuardianName,
      notes,

      medicalNotes,
      waiverSigned,
      waiverSignedAt,

      primaryStyle,
      stylesNotes,
      rank,
      startDate,
      uniformSize,
      styleDocuments,

      membershipType,

      photoUrl,
      paymentNotes,
    } = body || {};

    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (status !== undefined) updateData.status = status;

    if (dateOfBirth !== undefined)
      updateData.dateOfBirth = toDateOrNull(dateOfBirth);
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (emergencyContactName !== undefined)
      updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined)
      updateData.emergencyContactPhone = emergencyContactPhone;
    if (parentGuardianName !== undefined)
      updateData.parentGuardianName = parentGuardianName;
    if (notes !== undefined) updateData.notes = notes;

    if (medicalNotes !== undefined) updateData.medicalNotes = medicalNotes;
    if (waiverSigned !== undefined) updateData.waiverSigned = !!waiverSigned;
    if (waiverSignedAt !== undefined)
      updateData.waiverSignedAt = toDateOrNull(waiverSignedAt);

    if (primaryStyle !== undefined) updateData.primaryStyle = primaryStyle;
    if (stylesNotes !== undefined) updateData.stylesNotes = stylesNotes;
    if (rank !== undefined) updateData.rank = rank;
    if (startDate !== undefined)
      updateData.startDate = toDateOrNull(startDate);
    if (uniformSize !== undefined) updateData.uniformSize = uniformSize;
    if (styleDocuments !== undefined) updateData.styleDocuments = styleDocuments;

    if (membershipType !== undefined)
      updateData.membershipType = membershipType;

    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    if (paymentNotes !== undefined) updateData.paymentNotes = paymentNotes;

    const member = await prisma.member.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ member });
  } catch (err) {
    console.error(`PATCH /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

// DELETE /api/members/:id
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    // Delete member and all related data (relationships, activities)
    await prisma.member.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to delete member" },
      { status: 500 }
    );
  }
}
