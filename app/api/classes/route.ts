import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { canAddClass } from "@/lib/trial";
import { logAudit } from "@/lib/audit";

// GET /api/classes
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const getTypes = searchParams.get("types");

    // If types=true, return unique class types
    if (getTypes === "true") {
      const classes = await prisma.classSession.findMany({
        where: {
          clientId,
          OR: [
            { classType: { not: null } },
            { classTypes: { not: null } },
          ],
        },
        select: {
          classType: true,
          classTypes: true,
        },
      });

      const allTypes = new Set<string>();
      for (const c of classes) {
        if (c.classType?.trim()) allTypes.add(c.classType.trim());
        if (c.classTypes) {
          try {
            const parsed: string[] = JSON.parse(c.classTypes);
            for (const t of parsed) { if (t.trim()) allTypes.add(t.trim()); }
          } catch { /* ignore */ }
        }
      }

      const classTypes = [...allTypes].sort();
      return NextResponse.json({ classTypes });
    }

    // Otherwise, return all classes
    const classes = await prisma.classSession.findMany({
      where: { clientId },
      include: {
        program: true,
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("Error fetching classes:", error);
    return new NextResponse("Failed to load classes", { status: 500 });
  }
}

// POST /api/classes
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, startsAt, endsAt, classType, classTypes, styleIds, styleNames, styleId, styleName, minRankId, minRankName, minRankIds, programId, isRecurring, frequencyNumber, frequencyUnit, scheduleStartDate, scheduleEndDate, isOngoing, color, coachId, coachName, coachAttendsAsStudent, maxCapacity, bookingEnabled, bookingCutoffMins, cancellationCutoffMins, bookingAdvanceDays, kioskEnabled, mobileConfirm, locationId, spaceId, minAge, maxAge } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!startsAt || !endsAt) {
      return new NextResponse("Start and end times are required", { status: 400 });
    }

    const classCheck = await canAddClass(clientId);
    if (!classCheck.allowed) {
      return NextResponse.json({ error: classCheck.reason }, { status: 403 });
    }

    // Verify every cross-table reference belongs to THIS tenant.
    // Without these checks a caller could point a new class at
    // another gym's style / program / location / space / coach --
    // wouldn't leak data on its own but would corrupt our own
    // records with foreign ids and eventually crash on cascading
    // reads (styles[].ranks queries, coach name mismatch, etc.).
    async function assertTenantRow(model:
      | "style" | "program" | "location" | "space" | "member",
      id: string,
    ) {
      if (model === "style") {
        const r = await prisma.style.findUnique({ where: { id }, select: { clientId: true } });
        return !!r && r.clientId === clientId;
      }
      if (model === "program") {
        const r = await prisma.program.findUnique({ where: { id }, select: { clientId: true } });
        return !!r && r.clientId === clientId;
      }
      if (model === "location") {
        const r = await prisma.location.findUnique({ where: { id }, select: { clientId: true } });
        return !!r && r.clientId === clientId;
      }
      if (model === "space") {
        const r = await prisma.space.findUnique({ where: { id }, select: { clientId: true } });
        return !!r && r.clientId === clientId;
      }
      const r = await prisma.member.findUnique({ where: { id }, select: { clientId: true } });
      return !!r && r.clientId === clientId;
    }
    if (styleId && !(await assertTenantRow("style", styleId))) {
      return NextResponse.json({ error: "Style not found in this tenant" }, { status: 400 });
    }
    if (programId && !(await assertTenantRow("program", programId))) {
      return NextResponse.json({ error: "Program not found in this tenant" }, { status: 400 });
    }
    if (locationId && !(await assertTenantRow("location", locationId))) {
      return NextResponse.json({ error: "Location not found in this tenant" }, { status: 400 });
    }
    if (spaceId && !(await assertTenantRow("space", spaceId))) {
      return NextResponse.json({ error: "Space not found in this tenant" }, { status: 400 });
    }
    if (coachId && !(await assertTenantRow("member", coachId))) {
      return NextResponse.json({ error: "Coach not found in this tenant" }, { status: 400 });
    }
    // styleIds arrives either as an array or a JSON-string; handle both.
    let styleIdList: string[] = [];
    if (Array.isArray(styleIds)) {
      styleIdList = styleIds.filter((s): s is string => typeof s === "string");
    } else if (typeof styleIds === "string" && styleIds.startsWith("[")) {
      try {
        const parsed = JSON.parse(styleIds);
        if (Array.isArray(parsed)) styleIdList = parsed.filter((s): s is string => typeof s === "string");
      } catch { /* ignore malformed */ }
    }
    for (const sid of styleIdList) {
      if (!(await assertTenantRow("style", sid))) {
        return NextResponse.json({ error: "One or more styleIds not in this tenant" }, { status: 400 });
      }
    }

    const classSession = await prisma.classSession.create({
      data: {
        name: name.trim(),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        classType: classType?.trim() || null,
        classTypes: classTypes || null,
        styleIds: styleIds || null,
        styleNames: styleNames || null,
        styleId: styleId || null,
        styleName: styleName || null,
        minRankId: minRankId || null,
        minRankName: minRankName || null,
        minRankIds: minRankIds || null,
        programId: programId || null,
        clientId,
        isRecurring: isRecurring || false,
        frequencyNumber: frequencyNumber || null,
        frequencyUnit: frequencyUnit || null,
        scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
        scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
        isOngoing: isOngoing !== undefined ? isOngoing : true,
        color: color || "#a3a3a3",
        coachId: coachId || null,
        coachName: coachName || null,
        coachAttendsAsStudent: !!coachAttendsAsStudent,
        maxCapacity: maxCapacity != null ? parseInt(maxCapacity) || null : null,
        bookingEnabled: bookingEnabled || false,
        bookingCutoffMins: bookingCutoffMins != null ? parseInt(bookingCutoffMins) || null : null,
        cancellationCutoffMins: cancellationCutoffMins != null ? parseInt(cancellationCutoffMins) || null : null,
        bookingAdvanceDays: bookingAdvanceDays != null ? parseInt(bookingAdvanceDays) || null : null,
        kioskEnabled: kioskEnabled || false,
        mobileConfirm: mobileConfirm || false,
        locationId: locationId || null,
        spaceId: spaceId || null,
        minAge: minAge != null ? parseInt(minAge) || null : null,
        maxAge: maxAge != null ? parseInt(maxAge) || null : null,
      },
      include: {
        program: true,
      },
    });

    logAudit({
      entityType: "ClassSession",
      entityId: classSession.id,
      action: "CREATE",
      summary: `Created class "${classSession.name}"`,
      clientId,
    }).catch(() => {});

    return NextResponse.json({ class: classSession }, { status: 201 });
  } catch (error) {
    // Surface the real Prisma error to the client so admins see why the
    // create failed (was returning a generic "Failed to create class"
    // for every error, which masked validation hints, missing required
    // fields, and FK violations).
    console.error("Error creating class:", error);
    const msg = error instanceof Error ? error.message : "Failed to create class";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
