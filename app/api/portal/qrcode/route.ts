import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAuthenticatedMember } from "@/lib/portal-auth";

// GET /api/portal/qrcode — generate QR code PNG for the authenticated portal member
export async function GET(_request: NextRequest) {
  const auth = await getAuthenticatedMember(_request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build check-in URL from request origin
  const host = _request.headers.get("x-forwarded-host") || _request.headers.get("host") || "localhost:3000";
  const protocol = _request.headers.get("x-forwarded-proto") || "http";
  const qrData = `${protocol}://${host}/kiosk/checkin?member=${auth.memberId}`;

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
