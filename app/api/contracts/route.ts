import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/contracts — list all signed contracts
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const url = new URL(req.url);
    const search = url.searchParams.get("search");
    const memberId = url.searchParams.get("memberId");

    const contracts = await prisma.signedContract.findMany({
      where: {
        clientId,
        ...(memberId ? { memberId } : {}),
        ...(search ? {
          member: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          },
        } : {}),
      },
      select: {
        id: true,
        planName: true,
        fileName: true,
        signedAt: true,
        membershipId: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { signedAt: "desc" },
    });

    // Decide "current" vs "lapsed" from the linked membership. Contracts
    // with no membership tie (standalone service/POS contracts) count as
    // current -- they have no lifecycle of their own to expire against.
    // SignedContract has no formal relation on membershipId, so we batch
    // the lookup ourselves.
    const membershipIds = Array.from(
      new Set(contracts.map((c) => c.membershipId).filter((v): v is string => !!v))
    );
    const memberships = membershipIds.length
      ? await prisma.membership.findMany({
          where: { id: { in: membershipIds } },
          select: { id: true, status: true, endDate: true },
        })
      : [];
    const membershipById = new Map(memberships.map((m) => [m.id, m]));
    const now = new Date();

    const withStatus = contracts.map((c) => {
      let isCurrent = true;
      if (c.membershipId) {
        const m = membershipById.get(c.membershipId);
        if (!m) {
          // Membership was deleted -- treat as lapsed.
          isCurrent = false;
        } else {
          const active = m.status === "ACTIVE";
          const notEnded = !m.endDate || m.endDate > now;
          isCurrent = active && notEnded;
        }
      }
      // Don't leak the raw membershipId to the client -- it's an
      // implementation detail we only needed for the join above.
      const { membershipId: _mid, ...rest } = c;
      return { ...rest, isCurrent };
    });

    return NextResponse.json({ contracts: withStatus });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return new NextResponse("Failed to fetch contracts", { status: 500 });
  }
}
