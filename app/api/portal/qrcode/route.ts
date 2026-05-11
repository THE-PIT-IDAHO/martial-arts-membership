import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAuthenticatedMember } from "@/lib/portal-auth";

// GET /api/portal/qrcode — generate QR code PNG for the authenticated portal member
export async function GET(_request: NextRequest) {
  const auth = await getAuthenticatedMember(_request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Short format — kiosk looks up member name from ID
  const qrData = `MBR:${auth.memberId}`;

  try {
    const pngBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 300,
      margin: 3,
      errorCorrectionLevel: "H", // Highest error correction — better for phone screens
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
