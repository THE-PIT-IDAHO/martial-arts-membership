import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendEmail, resolveRecipientEmails } from "@/lib/email";
import { generateMagicLinkToken } from "@/lib/portal-auth";

// Contract emails carry a long-lived magic link so new members can set up
// their portal account at their convenience (not just in the next 15 minutes).
const CONTRACT_MAGIC_LINK_EXPIRY_MINUTES = 60 * 24 * 7; // 7 days

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

    // Auto-email contract to member (fire and forget). Includes a long-lived
    // magic link so the member can set up portal access from this same email.
    if (pdfData) {
      const memberRecord = await prisma.member.findUnique({
        where: { id: memberId },
        select: { email: true },
      });

      resolveRecipientEmails(memberId).then(async (emails) => {
        if (emails.length === 0) return;
        const settings = await prisma.settings.findMany({
          where: { clientId, key: { in: ["gymName"] } },
        });
        const gymName = settings.find(s => s.key === "gymName")?.value || "Our Gym";

        // Build a portal magic-link URL. Member's own email is used so the
        // token routes them in even if there are multiple recipients (e.g.
        // a parent).
        let portalSection = "";
        if (memberRecord?.email) {
          try {
            const token = await generateMagicLinkToken(
              memberId,
              memberRecord.email,
              CONTRACT_MAGIC_LINK_EXPIRY_MINUTES,
            );
            const origin =
              req.headers.get("x-forwarded-host") ||
              req.headers.get("host") ||
              "app.dojostormsoftware.com";
            const protocol = req.headers.get("x-forwarded-proto") || "https";
            const portalUrl = `${protocol}://${origin}/portal/verify?token=${token}`;
            portalSection = `
              <div style="margin: 24px 0; padding: 18px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h3 style="margin: 0 0 8px; color: #111;">Access your member portal</h3>
                <p style="margin: 0 0 14px; color: #444; font-size: 14px;">
                  Use the button below to sign in to the ${gymName} portal — book classes,
                  view payment history, and update your profile. This link works for the next 7 days.
                </p>
                <p style="margin: 0;">
                  <a href="${portalUrl}" style="display: inline-block; padding: 10px 20px; background: #c41111; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                    Open My Portal
                  </a>
                </p>
                <p style="margin: 12px 0 0; color: #777; font-size: 12px;">
                  Once you're in, you can set a permanent password under Profile → Set Password.
                </p>
              </div>
            `;
          } catch (err) {
            console.error("Failed to generate magic link for contract email:", err);
          }
        }

        await sendEmail({
          to: emails,
          subject: `Your Contract - ${planName || "Membership Agreement"}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Your Signed Contract</h2>
              <p>Thank you, ${memberName || "Member"}! Your signed contract for <strong>${planName}</strong> is attached.</p>
              <p>Keep this document for your records.</p>
              ${portalSection}
              <p style="color: #666; font-size: 12px; margin-top: 24px;">
                This is an automated message from ${gymName}. If you have questions, please contact us directly.
              </p>
            </div>
          `,
          attachments: [{ filename: fileName, content: pdfData! }],
          clientId,
          memberId,
          eventType: "CONTRACT_SIGNED",
        });
      }).catch(() => {});
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error creating signed contract:", error);
    return NextResponse.json({ error: "Failed to create signed contract" }, { status: 500 });
  }
}
