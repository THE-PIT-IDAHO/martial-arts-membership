import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendEmail, resolveRecipientEmails } from "@/lib/email";
import { fetchContractPdf } from "@/lib/contract-storage";

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

    // Resend wants the attachment as base64. pdfData is either a Blob URL
    // (new contracts) or raw base64 (legacy contracts not yet migrated).
    let attachmentBase64: string;
    if (contract.pdfData.startsWith("http")) {
      const buffer = await fetchContractPdf(contract.pdfData);
      attachmentBase64 = buffer.toString("base64");
    } else {
      attachmentBase64 = contract.pdfData.startsWith("data:")
        ? contract.pdfData.split(",")[1]
        : contract.pdfData;
    }

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
        content: attachmentBase64,
      }],
      clientId,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Error resending contract:", error);
    return NextResponse.json({ error: "Failed to resend contract" }, { status: 500 });
  }
}

// DELETE /api/contracts/:id — delete a contract
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const contract = await prisma.signedContract.findUnique({ where: { id } });
    if (!contract || contract.clientId !== clientId) {
      return new NextResponse("Contract not found", { status: 404 });
    }

    await prisma.signedContract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contract:", error);
    return new NextResponse("Failed to delete contract", { status: 500 });
  }
}
