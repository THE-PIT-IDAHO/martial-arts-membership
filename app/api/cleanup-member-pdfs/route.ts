import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/cleanup-member-pdfs — Remove all rank PDF entries from member styleDocuments
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);

    const members = await prisma.member.findMany({
      where: { clientId, styleDocuments: { not: null } },
      select: { id: true, styleDocuments: true },
    });

    let cleaned = 0;
    for (const member of members) {
      if (!member.styleDocuments) continue;
      try {
        const docs = JSON.parse(member.styleDocuments);
        if (!Array.isArray(docs)) continue;
        // Remove any docs that look like rank PDFs (data URIs or curriculum-named)
        const filtered = docs.filter((d: { name?: string; url?: string }) => {
          if (!d.name) return true;
          const name = d.name.toLowerCase();
          // Remove curriculum PDFs and rank-related docs
          if (name.includes("curriculum")) return false;
          if (name.includes("contract")) return false;
          // Remove docs with base64 data URIs (these are old synced PDFs)
          if (d.url?.startsWith("data:application/pdf")) return false;
          return true;
        });
        if (filtered.length !== docs.length) {
          await prisma.member.update({
            where: { id: member.id },
            data: { styleDocuments: filtered.length > 0 ? JSON.stringify(filtered) : null },
          });
          cleaned++;
        }
      } catch { /* skip invalid JSON */ }
    }

    return NextResponse.json({ cleaned, total: members.length });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new NextResponse("Failed to cleanup", { status: 500 });
  }
}
