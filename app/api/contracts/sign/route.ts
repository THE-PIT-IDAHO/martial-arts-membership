import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendContractSignedEmail } from "@/lib/notifications";

// POST /api/contracts/sign
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberId, membershipId, transactionId, planName, itemsSummary, contractContent, signatureData, pdfBase64, memberName } = body;

    if (!memberId || !signatureData || !contractContent) {
      return NextResponse.json(
        { error: "memberId, signatureData, and contractContent are required" },
        { status: 400 }
      );
    }

    const fileName = `${memberName || "Member"} - ${planName || "Contract"}.pdf`;

    // Strip data URI prefix from PDF if present
    let pdfData: string | null = pdfBase64 || null;
    if (pdfData && pdfData.includes(",")) {
      pdfData = pdfData.split(",")[1];
    }

    let contract;
    try {
      contract = await prisma.signedContract.create({
        data: {
          memberId,
          membershipId: membershipId || null,
          transactionId: transactionId || null,
          planName: planName || "Sale Contract",
          itemsSummary: itemsSummary || "[]",
          contractContent,
          signatureData,
          pdfData,
          fileName,
          clientId,
        },
      });
    } catch (dbErr) {
      // Fallback if pdfData/fileName columns don't exist yet
      console.warn("Contract create with PDF failed, trying without:", dbErr);
      contract = await prisma.signedContract.create({
        data: {
          memberId,
          membershipId: membershipId || null,
          transactionId: transactionId || null,
          planName: planName || "Sale Contract",
          itemsSummary: itemsSummary || "[]",
          contractContent,
          signatureData,
          clientId,
        },
      });
    }

    // Auto-email contract via the contract_signed template. Template handles
    // the magic-link portal CTA and is editable from Communications → Email
    // Templates. Fire-and-forget so the API response isn't blocked on Resend.
    if (pdfData) {
      sendContractSignedEmail({
        memberId,
        memberName: memberName || "Member",
        planName: planName || "Membership Agreement",
        pdfBase64: pdfData,
        fileName,
        clientId,
      }).catch((err) => {
        console.error("Failed to send contract email:", err);
      });
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error creating signed contract:", error);
    return NextResponse.json({ error: "Failed to create signed contract" }, { status: 500 });
  }
}
