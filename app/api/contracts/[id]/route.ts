import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendEmail, resolveRecipientEmails } from "@/lib/email";

// GET /api/contracts/:id — get a single contract with PDF data
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const contract = await prisma.signedContract.findUnique({
      where: { id },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!contract || contract.clientId !== clientId) {
      return new NextResponse("Contract not found", { status: 404 });
    }

    return NextResponse.json({ contract });
  } catch (error) {
    console.error("Error fetching contract:", error);
    return new NextResponse("Failed to fetch contract", { status: 500 });
  }
}

// POST /api/contracts/:id — resend contract email
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const contract = await prisma.signedContract.findUnique({
      where: { id },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!contract || contract.clientId !== clientId) {
      return new NextResponse("Contract not found", { status: 404 });
    }

    if (!contract.pdfData) {
      return NextResponse.json({ error: "No PDF data stored for this contract" }, { status: 400 });
    }

    const emails = await resolveRecipientEmails(contract.memberId);
    if (emails.length === 0) {
      return NextResponse.json({ error: "No email address found for member" }, { status: 400 });
    }

    const memberName = `${contract.member.firstName} ${contract.member.lastName}`;
    const settings = await prisma.settings.findMany({
      where: { clientId, key: { in: ["gymName"] } },
    });
    const gymName = settings.find(s => s.key === "gymName")?.value || "Our Gym";

    await sendEmail({
      to: emails,
      subject: `Your Contract - ${contract.planName || "Membership Agreement"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Your Signed Contract</h2>
          <p>Here is a copy of your signed contract for <strong>${contract.planName}</strong>.</p>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">
            This is an automated message from ${gymName}.
          </p>
        </div>
      `,
      attachments: [{
        filename: contract.fileName || `${memberName} - ${contract.planName}.pdf`,
        content: contract.pdfData,
      }],
      clientId,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Error resending contract:", error);
    return NextResponse.json({ error: "Failed to resend contract" }, { status: 500 });
  }
}
