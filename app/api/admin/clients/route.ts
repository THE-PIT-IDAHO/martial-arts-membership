import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { generateSlug } from "@/lib/tenant";
import { hashPassword, requireOwner } from "@/lib/admin-auth";

// GET /api/admin/clients — list all gym clients (OWNER only)
export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

// POST /api/admin/clients — create a new gym client (OWNER only)
export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, adminEmail, adminPassword, adminName, maxMembers, maxStyles, trialMonths } = await req.json();

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
      const trialExpiresAt = trialMonths
        ? new Date(Date.now() + trialMonths * 7 * 24 * 60 * 60 * 1000)
        : null;

      const client = await tx.client.create({
        data: {
          name,
          slug,
          maxMembers: maxMembers || 10,
          maxStyles: maxStyles || 3,
          trialExpiresAt,
        },
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

// PATCH /api/admin/clients — update a gym client's trial settings (OWNER only)
export async function PATCH(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { clientId, maxMembers, maxStyles, trialExpiresAt, removeTrial } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (maxMembers !== undefined) data.maxMembers = parseInt(maxMembers) || 10;
    if (maxStyles !== undefined) data.maxStyles = parseInt(maxStyles) || 3;
    if (removeTrial) {
      data.trialExpiresAt = null;
    } else if (trialExpiresAt !== undefined) {
      data.trialExpiresAt = trialExpiresAt ? new Date(trialExpiresAt) : null;
    }

    const client = await prisma.client.update({
      where: { id: clientId },
      data,
    });

    return NextResponse.json({ client });
  } catch (error) {
    console.error("Error updating client:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

// DELETE /api/admin/clients — delete a gym client and all its data (OWNER only)
export async function DELETE(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("id");
    if (!clientId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Delete all related data in order (respecting foreign keys)
    await prisma.$transaction(async (tx) => {
      await tx.attendance.deleteMany({ where: { classSession: { clientId } } });
      await tx.classBooking.deleteMany({ where: { classSession: { clientId } } });
      await tx.classSession.deleteMany({ where: { clientId } });
      await tx.invoice.deleteMany({ where: { member: { clientId } } });
      await tx.signedWaiver.deleteMany({ where: { clientId } });
      await tx.member.deleteMany({ where: { clientId } });
      await tx.membershipPlan.deleteMany({ where: { clientId } });
      await tx.settings.deleteMany({ where: { clientId } });
      await tx.auditLog.deleteMany({ where: { clientId } });
      await tx.user.deleteMany({ where: { clientId } });
      await tx.client.delete({ where: { id: clientId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
