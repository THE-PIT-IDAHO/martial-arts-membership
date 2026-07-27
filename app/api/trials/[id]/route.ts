import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All three handlers verify TrialPass.clientId matches the caller's
// tenant. Without this, any admin could GET the trial (leaking the
// member name), PATCH its maxClasses / expiresAt / status, or
// DELETE (mark EXPIRED) any gym's trial pass just by knowing the id.

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const clientId = await getClientId(req);
  const trial = await prisma.trialPass.findUnique({
    where: { id: params.id },
    include: { member: { select: { firstName: true, lastName: true } } },
  });
  if (!trial || trial.clientId !== clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ trial });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(req);
    const existing = await prisma.trialPass.findUnique({
      where: { id: params.id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const clientId = await getClientId(req);
  const existing = await prisma.trialPass.findUnique({
    where: { id: params.id },
    select: { clientId: true },
  });
  if (!existing || existing.clientId !== clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.trialPass.update({
    where: { id: params.id },
    data: { status: "EXPIRED" },
  });
  return NextResponse.json({ success: true });
}
