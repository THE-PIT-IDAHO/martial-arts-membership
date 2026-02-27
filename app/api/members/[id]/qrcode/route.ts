import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/members/[id]/qrcode — generate QR code PNG for a member
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify member belongs to this tenant
  const clientId = await getClientId(_request);
  const member = await prisma.member.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Encode member ID as JSON payload for the scanner
  const qrData = JSON.stringify({ memberId: id });

  try {
    const pngBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new NextResponse(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}
