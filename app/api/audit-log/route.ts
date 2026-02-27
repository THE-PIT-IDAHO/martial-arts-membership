import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: any = { clientId };
    if (entityType) where.entityType = entityType;
    if (search) {
      where.summary = { contains: search };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total });
  } catch (err) {
    console.error("GET /api/audit-log error:", err);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
