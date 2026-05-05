import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSlug } from "@/lib/tenant";
import { hashPassword } from "@/lib/admin-auth";
import defaultStyles from "@/lib/default-styles.json";

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

      // Create default styles with full rank data (colors, layers, requirements)
      for (const s of defaultStyles) {
        const style = await tx.style.create({
          data: {
            name: s.name,
            beltSystemEnabled: s.beltSystemEnabled,
            testNamingConvention: s.testNamingConvention,
            clientId: client.id,
            beltConfig: JSON.stringify(s.beltConfig),
          },
        });
        for (const r of s.dbRanks) {
          await tx.rank.create({
            data: {
              name: r.name,
              order: r.order,
              classRequirement: r.classRequirement,
              styleId: style.id,
            },
          });
        }
      }

      // Create sample classes linked to the default styles
      const createdStyles = await tx.style.findMany({ where: { clientId: client.id }, select: { id: true, name: true } });
      const kempoStyle = createdStyles.find(s => s.name === "Kempo");
      const bjjStyle = createdStyles.find(s => s.name === "Brazilian Jiu-Jitsu");

      const sampleClasses = [
        {
          name: "Kempo",
          classType: "Kempo",
          styleId: kempoStyle?.id || null,
          styleName: kempoStyle ? "Kempo" : null,
          styleIds: kempoStyle ? JSON.stringify([kempoStyle.id]) : null,
          styleNames: kempoStyle ? JSON.stringify(["Kempo"]) : null,
          color: "#cc0000",
        },
        {
          name: "BJJ",
          classType: "BJJ",
          styleId: bjjStyle?.id || null,
          styleName: bjjStyle ? "Brazilian Jiu-Jitsu" : null,
          styleIds: bjjStyle ? JSON.stringify([bjjStyle.id]) : null,
          styleNames: bjjStyle ? JSON.stringify(["Brazilian Jiu-Jitsu"]) : null,
          color: "#03c200",
        },
        {
          name: "Sparring",
          classType: "Sparring",
          styleId: kempoStyle?.id || null,
          styleName: kempoStyle ? "Kempo" : null,
          styleIds: JSON.stringify([kempoStyle?.id, bjjStyle?.id].filter(Boolean)),
          styleNames: JSON.stringify(["Kempo", "Brazilian Jiu-Jitsu"].filter((_, i) => [kempoStyle, bjjStyle][i])),
          color: "#8b0000",
        },
        {
          name: "No-Gi",
          classType: "No-Gi",
          styleId: bjjStyle?.id || null,
          styleName: bjjStyle ? "Brazilian Jiu-Jitsu" : null,
          styleIds: JSON.stringify([bjjStyle?.id, kempoStyle?.id].filter(Boolean)),
          styleNames: JSON.stringify(["Brazilian Jiu-Jitsu", "Kempo"].filter((_, i) => [bjjStyle, kempoStyle][i])),
          color: "#7d7d7d",
        },
      ];

      const now = new Date();
      const classTimes = [16, 17, 18, 19]; // 4pm, 5pm, 6pm, 7pm

      for (let i = 0; i < sampleClasses.length; i++) {
        const cls = sampleClasses[i];
        const hour = classTimes[i];
        const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0);
        const endsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour + 1, 0);

        await tx.classSession.create({
          data: {
            name: cls.name,
            classType: cls.classType,
            styleId: cls.styleId,
            styleName: cls.styleName,
            styleIds: cls.styleIds,
            styleNames: cls.styleNames,
            color: cls.color,
            startsAt,
            endsAt,
            isRecurring: false,
            kioskEnabled: true,
            clientId: client.id,
          },
        });
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
