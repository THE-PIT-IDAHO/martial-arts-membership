import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return new NextResponse("No files provided", { status: 400 });
    }

    const uploadedFiles: { name: string; size: number; type: string; url: string }[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const uint8Array = new Uint8Array(bytes);

      // Create unique filename
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `${timestamp}-${safeName}`;

      // Save to public/uploads
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      const filepath = path.join(uploadDir, filename);

      await writeFile(filepath, uint8Array);

      uploadedFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        url: `/uploads/${filename}`,
      });
    }

    return NextResponse.json({ files: uploadedFiles });
  } catch (error) {
    console.error("Upload error:", error);
    return new NextResponse("Failed to upload files", { status: 500 });
  }
}
