import { NextResponse } from "next/server";
import { sendEmail, resolveRecipientEmails } from "@/lib/email";

// POST /api/contracts/email
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, pdfBase64, contractTitle } = body;

    if (!memberId || !pdfBase64) {
      return NextResponse.json(
        { error: "memberId and pdfBase64 are required" },
        { status: 400 }
      );
    }

    const emails = await resolveRecipientEmails(memberId);
    if (emails.length === 0) {
      return NextResponse.json({ sent: false, reason: "No email addresses found" });
    }

    const title = contractTitle || "Your Membership Contract";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${title}</h2>
        <p>Thank you for your purchase. Please find your signed contract attached as a PDF.</p>
        <p>Keep this document for your records.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          This is an automated message. If you have questions, please contact us directly.
        </p>
      </div>
    `;

    // Extract raw base64 content (strip data URI prefix if present)
    let base64Content = pdfBase64;
    if (base64Content.includes(",")) {
      base64Content = base64Content.split(",")[1];
    }

    const sent = await sendEmail({
      to: emails,
      subject: title,
      html,
      attachments: [
        {
          filename: "contract.pdf",
          content: base64Content,
        },
      ],
    });

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Error emailing contract:", error);
    return NextResponse.json({ error: "Failed to email contract" }, { status: 500 });
  }
}
