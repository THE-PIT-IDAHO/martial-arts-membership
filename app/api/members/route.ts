// app/api/members/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MIN_MEMBER_NUMBER = 10000000;

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// find lowest free memberNumber >= MIN_MEMBER_NUMBER
async function getNextMemberNumber() {
  const existing = await prisma.member.findMany({
    where: {
      memberNumber: {
        gte: MIN_MEMBER_NUMBER,
      },
    },
    select: { memberNumber: true },
    orderBy: { memberNumber: "asc" },
  });

  let candidate = MIN_MEMBER_NUMBER;
  for (const row of existing) {
    if (row.memberNumber == null) continue;
    if (row.memberNumber === candidate) {
      candidate++;
    } else if (row.memberNumber > candidate) {
      break;
    }
  }
  return candidate;
}

// GET /api/members
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    const members = await prisma.member.findMany({
      where: whereClause,
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
    });

    return NextResponse.json({ members });
  } catch (err) {
    console.error("GET /api/members error:", err);
    return NextResponse.json(
      { error: "Failed to load members" },
      { status: 500 }
    );
  }
}

// POST /api/members
export async function POST(req: Request) {
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

      clientId: incomingClientId,
    } = body || {};

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // pick a client
    let clientId = incomingClientId as string | undefined;
    if (!clientId) {
      const existingClient = await prisma.client.findFirst();
      if (!existingClient) {
        return NextResponse.json(
          { error: "No client found. Please create a Client first." },
          { status: 400 }
        );
      }
      clientId = existingClient.id;
    }

    const memberNumber = await getNextMemberNumber();

    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        clientId,
        status: status || "PROSPECT",
        memberNumber,

        dateOfBirth: toDateOrNull(dateOfBirth),
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        parentGuardianName: parentGuardianName || null,
        notes: notes || null,
        medicalNotes: medicalNotes || null,
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("POST /api/members error:", err);
    return NextResponse.json(
      { error: "Failed to create member" },
      { status: 500 }
    );
  }
}
