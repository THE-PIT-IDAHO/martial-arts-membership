import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import {
  getActiveProcessor,
  createCheckoutSession,
  getCurrency,
  ensureProcessorCustomer,
} from "@/lib/payment";

// POST /api/portal/invoices/pay — create a checkout session to pay an invoice
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceId } = await req.json();
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      membership: {
        select: { membershipPlan: { select: { name: true } } },
      },
    },
  });

  if (!invoice || invoice.memberId !== auth.memberId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
  }

  const processor = await getActiveProcessor();
  if (!processor) {
    return NextResponse.json({ error: "No payment processor configured" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Ensure processor customer exists
  await ensureProcessorCustomer({
    memberId: member.id,
    email: member.email || undefined,
    name: `${member.firstName} ${member.lastName}`,
  });

  const currency = await getCurrency();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const planName = invoice.membership?.membershipPlan?.name || "Membership";
  const description = invoice.invoiceNumber
    ? `Invoice #${invoice.invoiceNumber} — ${planName}`
    : planName;

  const session = await createCheckoutSession({
    amountCents: invoice.amountCents,
    currency,
    description,
    successUrl: `${baseUrl}/portal/memberships?paid=success`,
    cancelUrl: `${baseUrl}/portal/memberships`,
    memberId: member.id,
    memberEmail: member.email || undefined,
    metadata: {
      memberId: member.id,
      invoiceId: invoice.id,
      source: "portal_invoice_pay",
    },
  });

  return NextResponse.json({ url: session.url });
}
