import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSlug } from "@/lib/tenant";
import { hashPassword } from "@/lib/admin-auth";

// GET /api/public/signup?token=xxx — validate a signup token
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const link = await prisma.signupLink.findUnique({ where: { token } });

  if (!link) {
    return NextResponse.json({ error: "Invalid signup link" }, { status: 404 });
  }

  if (!link.active) {
    return NextResponse.json({ error: "This signup link is no longer active" }, { status: 410 });
  }

  if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
    return NextResponse.json({ error: "This signup link has expired" }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    maxMembers: link.maxMembers,
    maxStyles: link.maxStyles,
    trialMonths: link.trialMonths,
  });
}

// POST /api/public/signup — create a gym account using a signup token
export async function POST(req: Request) {
  try {
    const { token, gymName, adminName, adminEmail, adminPassword } = await req.json();

    if (!token || !gymName || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate token
    const link = await prisma.signupLink.findUnique({ where: { token } });

    if (!link) {
      return NextResponse.json({ error: "Invalid signup link" }, { status: 404 });
    }
    if (!link.active) {
      return NextResponse.json({ error: "This signup link is no longer active" }, { status: 410 });
    }
    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return NextResponse.json({ error: "This signup link has expired" }, { status: 410 });
    }

    const slug = generateSlug(gymName);
    if (!slug) {
      return NextResponse.json({ error: "Invalid gym name" }, { status: 400 });
    }

    // Check slug uniqueness
    const existing = await prisma.client.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "A gym with this name already exists. Please choose a different name." },
        { status: 409 }
      );
    }

    const trialExpiresAt = link.trialMonths > 0
      ? new Date(Date.now() + link.trialMonths * 7 * 24 * 60 * 60 * 1000)
      : null;

    // Create client + admin user + mark link as used
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: gymName.trim(),
          slug,
          maxMembers: link.maxMembers,
          maxStyles: link.maxStyles,
          maxRanksPerStyle: link.maxRanksPerStyle,
          maxMembershipPlans: link.maxMembershipPlans,
          maxClasses: link.maxClasses,
          maxUsers: link.maxUsers,
          maxLocations: link.maxLocations,
          maxReports: link.maxReports,
          maxPOSItems: link.maxPOSItems,
          allowStripe: link.allowStripe,
          allowPaypal: link.allowPaypal,
          allowSquare: link.allowSquare,
          priceCents: link.priceCents,
          trialExpiresAt,
        },
      });

      const passwordHash = await hashPassword(adminPassword);
      const user = await tx.user.create({
        data: {
          email: adminEmail.toLowerCase().trim(),
          passwordHash,
          name: adminName?.trim() || "Owner",
          role: "OWNER",
          clientId: client.id,
        },
      });

      await tx.signupLink.update({
        where: { id: link.id },
        data: { useCount: { increment: 1 } },
      });

      // Create 2 default styles with standard belt ranks
      const defaultStyles = [
        {
          name: "Karate",
          belts: ["White Belt", "Yellow Belt", "Orange Belt", "Green Belt", "Blue Belt", "Purple Belt", "Brown Belt", "Black Belt"],
        },
        {
          name: "Brazilian Jiu-Jitsu",
          belts: ["White Belt", "Blue Belt", "Purple Belt", "Brown Belt", "Black Belt"],
        },
      ];

      for (const s of defaultStyles) {
        // Build beltConfig ranks array
        const beltConfigRanks = s.belts.map((belt, i) => ({
          id: `default-${i}`,
          name: belt,
          order: i,
        }));

        const style = await tx.style.create({
          data: {
            name: s.name,
            beltSystemEnabled: true,
            clientId: client.id,
            beltConfig: JSON.stringify({ ranks: beltConfigRanks }),
          },
        });
        for (let i = 0; i < s.belts.length; i++) {
          await tx.rank.create({
            data: {
              name: s.belts[i],
              order: i,
              styleId: style.id,
            },
          });
        }
      }

      return { client, user };
    });

    return NextResponse.json({
      success: true,
      gymName: result.client.name,
      slug: result.client.slug,
      loginUrl: `https://${result.client.slug}.dojostormsoftware.com/login`,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating gym account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
