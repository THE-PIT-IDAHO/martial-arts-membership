import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/gift-certificates/lookup?code=GC-XXXXXX
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return new NextResponse("Gift certificate code is required", { status: 400 });
    }

    const certificate = await prisma.giftCertificate.findFirst({
      where: { code: code.toUpperCase(), clientId },
    });

    if (!certificate) {
      return new NextResponse("Gift certificate not found", { status: 404 });
    }

    if (certificate.status === "VOIDED") {
      return new NextResponse("This gift certificate has been voided", { status: 400 });
    }

    if (certificate.status === "REDEEMED" || certificate.balanceCents <= 0) {
      return new NextResponse("This gift certificate has no remaining balance", { status: 400 });
    }

    return NextResponse.json({
      code: certificate.code,
      balanceCents: certificate.balanceCents,
      amountCents: certificate.amountCents,
      recipientName: certificate.recipientName,
    });
  } catch (error) {
    console.error("Error looking up gift certificate:", error);
    return new NextResponse("Failed to look up gift certificate", { status: 500 });
  }
}
