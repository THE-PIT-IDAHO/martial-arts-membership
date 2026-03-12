import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// PATCH /api/ranks/:id — update rank fields (e.g., pdfDocument)
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    await getClientId(req);
    const body = await req.json();
    const { pdfDocument } = body;

    const data: Record<string, unknown> = {};
    if (pdfDocument !== undefined) {
      data.pdfDocument = pdfDocument;
    }

    const rank = await prisma.rank.update({
      where: { id },
      data,
    });

    return NextResponse.json({ rank });
  } catch (error) {
    console.error("Error updating rank:", error);
    return new NextResponse("Failed to update rank", { status: 500 });
  }
}
