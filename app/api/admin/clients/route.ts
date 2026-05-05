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

    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const parse = (v: unknown, def: number) => v !== undefined ? parseInt(String(v)) || def : undefined;
    const data: Record<string, unknown> = {};

    if (body.maxMembers !== undefined) data.maxMembers = parse(body.maxMembers, 10);
    if (body.maxStyles !== undefined) data.maxStyles = parse(body.maxStyles, 3);
    if (body.maxRanksPerStyle !== undefined) data.maxRanksPerStyle = parse(body.maxRanksPerStyle, 10);
    if (body.maxMembershipPlans !== undefined) data.maxMembershipPlans = parse(body.maxMembershipPlans, 3);
    if (body.maxClasses !== undefined) data.maxClasses = parse(body.maxClasses, 5);
    if (body.maxUsers !== undefined) data.maxUsers = parse(body.maxUsers, 2);
    if (body.maxLocations !== undefined) data.maxLocations = parse(body.maxLocations, 1);
    if (body.maxReports !== undefined) data.maxReports = parse(body.maxReports, 3);
    if (body.maxPOSItems !== undefined) data.maxPOSItems = parse(body.maxPOSItems, 10);
    if (body.allowStripe !== undefined) data.allowStripe = !!body.allowStripe;
    if (body.allowPaypal !== undefined) data.allowPaypal = !!body.allowPaypal;
    if (body.allowSquare !== undefined) data.allowSquare = !!body.allowSquare;
    if (body.priceCents !== undefined) data.priceCents = body.priceCents !== "" ? parseInt(body.priceCents) || 0 : 0;
    if (body.removeTrial) {
      data.trialExpiresAt = null;
    } else if (body.trialExpiresAt !== undefined) {
      data.trialExpiresAt = body.trialExpiresAt ? new Date(body.trialExpiresAt) : null;
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
      // Attendance & bookings
      await tx.attendance.deleteMany({ where: { classSession: { clientId } } });
      await tx.classBooking.deleteMany({ where: { classSession: { clientId } } });
      await tx.classSession.deleteMany({ where: { clientId } });

      // Members and related
      await tx.memberRelationship.deleteMany({ where: { fromMember: { clientId } } });
      await tx.membership.deleteMany({ where: { member: { clientId } } });
      await tx.invoice.deleteMany({ where: { member: { clientId } } });
      await tx.trialPass.deleteMany({ where: { member: { clientId } } });
      await tx.memberAuthToken.deleteMany({ where: { member: { clientId } } });
      await tx.memberSession.deleteMany({ where: { member: { clientId } } });
      await tx.signedWaiver.deleteMany({ where: { clientId } });
      await tx.member.deleteMany({ where: { clientId } });

      // Styles & curriculum
      await tx.rankTestItem.deleteMany({ where: { category: { rankTest: { rank: { style: { clientId } } } } } });
      await tx.rankTestCategory.deleteMany({ where: { rankTest: { rank: { style: { clientId } } } } });
      await tx.rankTest.deleteMany({ where: { rank: { style: { clientId } } } });
      await tx.rank.deleteMany({ where: { style: { clientId } } });
      await tx.style.deleteMany({ where: { clientId } });

      // Testing & promotions
      await tx.testingParticipant.deleteMany({ where: { testingEvent: { clientId } } });
      await tx.testingEvent.deleteMany({ where: { clientId } });
      await tx.promotionParticipant.deleteMany({ where: { promotionEvent: { clientId } } });
      await tx.promotionEvent.deleteMany({ where: { clientId } });

      // POS
      await tx.pOSLineItem.deleteMany({ where: { POSTransaction: { clientId } } });
      await tx.pOSTransaction.deleteMany({ where: { clientId } });
      await tx.pOSItemVariant.deleteMany({ where: { item: { clientId } } });
      await tx.pOSItem.deleteMany({ where: { clientId } });

      // Board/communication
      await tx.boardReply.deleteMany({ where: { post: { channel: { clientId } } } });
      await tx.boardFile.deleteMany({ where: { post: { channel: { clientId } } } });
      await tx.boardPost.deleteMany({ where: { channel: { clientId } } });
      await tx.boardPollVote.deleteMany({ where: { option: { poll: { channel: { clientId } } } } });
      await tx.boardPollOption.deleteMany({ where: { poll: { channel: { clientId } } } });
      await tx.boardPoll.deleteMany({ where: { channel: { clientId } } });
      await tx.boardEvent.deleteMany({ where: { clientId } });
      await tx.boardChannel.deleteMany({ where: { clientId } });

      // Other
      await tx.waiverTemplate.deleteMany({ where: { clientId } });
      await tx.emailTemplate.deleteMany({ where: { clientId } });
      await tx.enrollmentSubmission.deleteMany({ where: { clientId } });
      await tx.membershipPlan.deleteMany({ where: { clientId } });
      await tx.promoCode.deleteMany({ where: { clientId } });
      await tx.location.deleteMany({ where: { clientId } });
      await tx.program.deleteMany({ where: { clientId } });
      await tx.task.deleteMany({ where: { clientId } });
      await tx.appointment.deleteMany({ where: { clientId } });
      await tx.settings.deleteMany({ where: { clientId } });
      await tx.auditLog.deleteMany({ where: { clientId } });
      await tx.supportTicket.deleteMany({ where: { clientId } });
      await tx.user.deleteMany({ where: { clientId } });
      await tx.client.delete({ where: { id: clientId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
