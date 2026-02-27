import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.pOSTransaction.findMany({
    where: {
      memberId: auth.memberId,
      paymentMethod: "STRIPE",
      status: "COMPLETED",
    },
    include: { POSLineItem: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ orders });
}
