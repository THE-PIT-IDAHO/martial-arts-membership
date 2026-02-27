import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const trial = await prisma.trialPass.findUnique({
    where: { id: params.id },
    include: { member: { select: { firstName: true, lastName: true } } },
  });
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ trial });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await req.json();
    const trial = await prisma.trialPass.update({
      where: { id: params.id },
      data: {
        ...(body.maxClasses !== undefined && { maxClasses: body.maxClasses }),
        ...(body.expiresAt && { expiresAt: new Date(body.expiresAt) }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.status && { status: body.status }),
      },
    });
    return NextResponse.json({ trial });
  } catch (error) {
    console.error("Error updating trial:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await prisma.trialPass.update({
    where: { id: params.id },
    data: { status: "EXPIRED" },
  });
  return NextResponse.json({ success: true });
}
