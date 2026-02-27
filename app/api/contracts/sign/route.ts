import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_ID = "default-client";

// POST /api/contracts/sign
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, membershipId, transactionId, planName, itemsSummary, contractContent, signatureData } = body;

    if (!memberId || !signatureData || !contractContent) {
      return NextResponse.json(
        { error: "memberId, signatureData, and contractContent are required" },
        { status: 400 }
      );
    }

    const contract = await prisma.signedContract.create({
      data: {
        memberId,
        membershipId: membershipId || null,
        transactionId: transactionId || null,
        planName: planName || "Sale Contract",
        itemsSummary: itemsSummary || "[]",
        contractContent,
        signatureData,
        clientId: DEFAULT_CLIENT_ID,
      },
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error creating signed contract:", error);
    return NextResponse.json({ error: "Failed to create signed contract" }, { status: 500 });
  }
}
