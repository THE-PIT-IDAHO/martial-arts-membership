import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendEmail, resolveRecipientEmails } from "@/lib/email";

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

    // Auto-email contract to member (fire and forget)
    if (pdfData) {
      resolveRecipientEmails(memberId).then(async (emails) => {
        if (emails.length === 0) return;
        const settings = await prisma.settings.findMany({
          where: { clientId, key: { in: ["gymName"] } },
        });
        const gymName = settings.find(s => s.key === "gymName")?.value || "Our Gym";

        await sendEmail({
          to: emails,
          subject: `Your Contract - ${planName || "Membership Agreement"}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Your Signed Contract</h2>
              <p>Thank you, ${memberName || "Member"}! Your signed contract for <strong>${planName}</strong> is attached.</p>
              <p>Keep this document for your records.</p>
              <p style="color: #666; font-size: 12px; margin-top: 24px;">
                This is an automated message from ${gymName}. If you have questions, please contact us directly.
              </p>
            </div>
          `,
          attachments: [{ filename: fileName, content: pdfData! }],
          clientId,
        });
      }).catch(() => {});
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error creating signed contract:", error);
    return NextResponse.json({ error: "Failed to create signed contract" }, { status: 500 });
  }
}
