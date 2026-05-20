// POST /api/upload/photo  — admin photo upload for member profiles.
// Accepts multipart form (field: "file") OR JSON ({ dataUri }) for compat
// with the old base64-form path. Returns { url } pointing to Vercel Blob.
import { NextResponse } from "next/server";
import { resizeAndUploadPhoto } from "@/lib/photo-upload";
import { getClientId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB cap on uploads

export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId") || "new";

    // If a memberId was passed, validate it belongs to this tenant before
    // letting the upload hit storage.
    if (memberId !== "new") {
      const m = await prisma.member.findUnique({
        where: { id: memberId },
        select: { clientId: true },
      });
      if (!m || m.clientId !== clientId) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
    }

    const contentType = req.headers.get("content-type") || "";

    let result;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      if (file.size > MAX_INPUT_BYTES) {
        return NextResponse.json({ error: "File too large (15 MB max)" }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      result = await resizeAndUploadPhoto(
        { kind: "buffer", buffer },
        { memberId, clientId },
      );
    } else {
      const body = await req.json().catch(() => ({}));
      const dataUri: string | undefined = body?.dataUri;
      if (!dataUri || !dataUri.startsWith("data:")) {
        return NextResponse.json({ error: "Missing dataUri" }, { status: 400 });
      }
      // Approximate decoded size from the base64 part.
      const approxBytes = Math.floor((dataUri.length - dataUri.indexOf(",")) * 0.75);
      if (approxBytes > MAX_INPUT_BYTES) {
        return NextResponse.json({ error: "File too large (15 MB max)" }, { status: 413 });
      }
      result = await resizeAndUploadPhoto(
        { kind: "dataUri", dataUri },
        { memberId, clientId },
      );
    }

    return NextResponse.json({ url: result.url, bytes: result.bytes });
  } catch (err) {
    console.error("POST /api/upload/photo error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
