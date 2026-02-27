import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ locations });
  } catch (err) {
    console.error("GET /api/locations error:", err);
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, address, city, state, zipCode, phone } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const location = await prisma.location.create({
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        phone: phone?.trim() || null,
        clientId: "default-client",
      },
    });

    logAudit({
      entityType: "Location",
      entityId: location.id,
      action: "CREATE",
      summary: `Created location "${location.name}"`,
    }).catch(() => {});

    return NextResponse.json({ location }, { status: 201 });
  } catch (err) {
    console.error("POST /api/locations error:", err);
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 });
  }
}
