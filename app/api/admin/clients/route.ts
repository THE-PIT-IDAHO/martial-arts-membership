import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { generateSlug } from "@/lib/tenant";
import { hashPassword } from "@/lib/admin-auth";

// GET /api/admin/clients — list all gym clients (super-admin only)
export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, users: true } },
      },
    });
    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

// POST /api/admin/clients — create a new gym client
export async function POST(req: Request) {
  try {
    const { name, adminEmail, adminPassword, adminName } = await req.json();

    if (!name || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "Name, admin email, and admin password are required" },
        { status: 400 }
      );
    }

    const slug = generateSlug(name);
    if (!slug) {
      return NextResponse.json({ error: "Invalid gym name" }, { status: 400 });
    }

    // Check slug uniqueness
    const existing = await prisma.client.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `A gym with slug "${slug}" already exists` },
        { status: 409 }
      );
    }

    // Create client + admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: { name, slug },
      });

      const passwordHash = await hashPassword(adminPassword);
      const user = await tx.user.create({
        data: {
          email: adminEmail.toLowerCase().trim(),
          passwordHash,
          name: adminName || "Owner",
          role: "OWNER",
          clientId: client.id,
        },
      });

      return { client, user };
    });

    return NextResponse.json({
      client: {
        id: result.client.id,
        name: result.client.name,
        slug: result.client.slug,
      },
      adminUser: {
        id: result.user.id,
        email: result.user.email,
      },
      url: `https://${result.client.slug}.dojostormsoftware.com`,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
