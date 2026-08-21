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

    // Verify memberId belongs to this tenant BEFORE anything is
    // written or emailed. Without this, an admin can post any gym's
    // memberId + an attacker-controlled PDF, and the endpoint would
    // fire sendContractSignedEmail which resolves recipient emails
    // from the foreign member and delivers the PDF to their inbox.
    // Phishing vector.
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clientId: true },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Verify membershipId + transactionId belong to this tenant too
    // (both optional).
    if (membershipId) {
      const ms = await prisma.membership.findUnique({
        where: { id: membershipId },
        select: { member: { select: { clientId: true } } },
      });
      if (!ms || ms.member.clientId !== clientId) {
        return NextResponse.json({ error: "Membership not found" }, { status: 400 });
      }
    }
    if (transactionId) {
      const tx = await prisma.pOSTransaction.findUnique({
        where: { id: transactionId },
        select: { clientId: true },
      });
      if (!tx || tx.clientId !== clientId) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 400 });
      }
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

    // Auto-email contract via the contract_signed template. Template
    // handles the magic-link portal CTA and is editable from Emails →
    // Email Templates. Awaited (was fire-and-forget) -- Vercel
    // serverless kills dangling promises the instant the response
    // returns, so fire-and-forget silently never completed on prod.
    if (pdfBase64Clean) {
      try {
        await sendContractSignedEmail({
          memberId,
          memberName: memberName || "Member",
          planName: planName || "Membership Agreement",
          pdfBase64: pdfBase64Clean,
          fileName,
          clientId,
        });
      } catch (err) {
        console.error("[contracts/sign] contract email failed:", err);
      }
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error creating signed contract:", error);
    return NextResponse.json({ error: "Failed to create signed contract" }, { status: 500 });
  }
}
