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

    // Decide "current" vs "lapsed" from the linked membership.
    //   - Contract tied to a membership: current iff that membership is
    //     still ACTIVE and its endDate hasn't passed.
    //   - Contract with no membershipId (standalone service / POS /
    //     legacy): lapsed unless the MEMBER still has any other active
    //     membership on file. Old signup PDFs for people who have since
    //     cancelled shouldn't crowd the primary list.
    // SignedContract has no formal relation on membershipId, so we
    // batch the lookups ourselves.
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

    // For null-membershipId contracts, look up whether the member has
    // ANY active membership. One query covers every such contract on
    // the page.
    const membersNeedingLookup = Array.from(
      new Set(contracts.filter((c) => !c.membershipId).map((c) => c.member.id))
    );
    const activeByMember = new Set<string>();
    if (membersNeedingLookup.length) {
      const activeMemberships = await prisma.membership.findMany({
        where: {
          memberId: { in: membersNeedingLookup },
          status: "ACTIVE",
          OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
        select: { memberId: true },
      });
      for (const m of activeMemberships) activeByMember.add(m.memberId);
    }

    const withStatus = contracts.map((c) => {
      let isCurrent: boolean;
      if (c.membershipId) {
        const m = membershipById.get(c.membershipId);
        if (!m) {
          isCurrent = false; // membership row was deleted
        } else {
          const active = m.status === "ACTIVE";
          const notEnded = !m.endDate || m.endDate > now;
          isCurrent = active && notEnded;
        }
      } else {
        // Fall back to "does the member have any active membership?"
        isCurrent = activeByMember.has(c.member.id);
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
