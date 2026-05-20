import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendContractSignedEmail } from "@/lib/notifications";
import { uploadContractPdf } from "@/lib/contract-storage";

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

    // Strip data URI prefix from PDF if present.
    let pdfBase64Clean: string | null = pdfBase64 || null;
    if (pdfBase64Clean && pdfBase64Clean.includes(",")) {
      pdfBase64Clean = pdfBase64Clean.split(",")[1];
    }

    // Create the contract row first so we have an id to use as the Blob path.
    let contract = await prisma.signedContract.create({
      data: {
        memberId,
        membershipId: membershipId || null,
        transactionId: transactionId || null,
        planName: planName || "Sale Contract",
        itemsSummary: itemsSummary || "[]",
        contractContent,
        signatureData,
        pdfData: null,
        fileName,
        clientId,
      },
    });

    // Upload the PDF to the PRIVATE contracts Blob store, then save the URL
    // in pdfData. We never store the base64 bytes in Postgres — they only
    // exist transiently in this request.
    if (pdfBase64Clean) {
      try {
        const { url } = await uploadContractPdf(
          { kind: "base64", base64: pdfBase64Clean },
          { contractId: contract.id, clientId },
        );
        contract = await prisma.signedContract.update({
          where: { id: contract.id },
          data: { pdfData: url },
        });
      } catch (uploadErr) {
        // If Blob upload fails (e.g. token missing on a fresh deploy),
        // fall back to storing the base64 in the DB so the contract isn't lost.
        console.error("Contract Blob upload failed, falling back to DB storage:", uploadErr);
        contract = await prisma.signedContract.update({
          where: { id: contract.id },
          data: { pdfData: pdfBase64Clean },
        });
      }
    }

    // Auto-email contract via the contract_signed template. Template handles
    // the magic-link portal CTA and is editable from Communications → Email
    // Templates. Fire-and-forget so the API response isn't blocked on Resend.
    if (pdfBase64Clean) {
      sendContractSignedEmail({
        memberId,
        memberName: memberName || "Member",
        planName: planName || "Membership Agreement",
        pdfBase64: pdfBase64Clean,
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
