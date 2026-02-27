import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/settings?key=waiver_content
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key) {
      const setting = await prisma.settings.findUnique({
        where: { key },
      });
      return NextResponse.json({ setting });
    }

    const settings = await prisma.settings.findMany();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return new NextResponse("Failed to fetch settings", { status: 500 });
  }
}

// PUT /api/settings - Save multiple settings at once (key-value object)
export async function PUT(req: Request) {
  try {
    const body = await req.json();

    // body is an object like { gymName: "My Gym", gymAddress: "123 St", ... }
    const entries = Object.entries(body);
    if (entries.length === 0) {
      return new NextResponse("No settings provided", { status: 400 });
    }

    for (const [key, value] of entries) {
      await prisma.settings.upsert({
        where: { key },
        update: { value: String(value ?? "") },
        create: { key, value: String(value ?? "") },
      });
    }

    const keys = entries.map(([k]) => k);
    logAudit({
      entityType: "Settings",
      entityId: "bulk",
      action: "UPDATE",
      summary: `Updated settings: ${keys.join(", ")}`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    return new NextResponse("Failed to save settings", { status: 500 });
  }
}

// POST /api/settings
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, value } = body;

    if (!key) {
      return new NextResponse("Key is required", { status: 400 });
    }

    const setting = await prisma.settings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json({ setting }, { status: 201 });
  } catch (error) {
    console.error("Error saving setting:", error);
    return new NextResponse("Failed to save setting", { status: 500 });
  }
}
