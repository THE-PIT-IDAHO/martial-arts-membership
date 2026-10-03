import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; pmId: string }> };

// DELETE /api/members/[id]/payment-methods/[pmId] — remove a saved card
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: memberId, pmId: paymentMethodId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true, defaultPaymentMethodId: true },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // PAYS_FOR pivot: when viewing a payee's profile (e.g. Isabella)
  // and removing a card, the card actually lives on the PAYER's
  // (e.g. Colten's) Stripe customer. Resolve the owner here so
  // the detach + default-clear target the right Member row.
  // Scoped to this tenant so a cross-tenant PAYS_FOR row can't
  // reach a foreign gym's customer.
  let ownerMemberId = memberId;
  let ownerStripeCustomerId = member.stripeCustomerId;
  let ownerDefaultPaymentMethodId = member.defaultPaymentMethodId;
  const payerRow = await prisma.memberRelationship.findFirst({
    where: {
      relationship: "PAYS_FOR",
      toMemberId: memberId,
      fromMember: { clientId },
    },
    select: {
      fromMember: {
        select: { id: true, stripeCustomerId: true, defaultPaymentMethodId: true },
      },
    },
  });
  if (payerRow?.fromMember?.stripeCustomerId) {
    ownerMemberId = payerRow.fromMember.id;
    ownerStripeCustomerId = payerRow.fromMember.stripeCustomerId;
    ownerDefaultPaymentMethodId = payerRow.fromMember.defaultPaymentMethodId;
  }

  if (!ownerStripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer on file for this member or their payer" }, { status: 400 });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  try {
    // Verify this payment method belongs to the owner's customer
    const pm = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== ownerStripeCustomerId) {
      return NextResponse.json({ error: "Payment method does not belong to this member or their payer" }, { status: 403 });
    }

    await stripeClient.paymentMethods.detach(paymentMethodId);

    // Clear default if this was the owner's default. Also clear
    // the setAt timestamp so if a new card is added later the
    // dunning loop's "only charge invoices dated ≥ setAt" guard
    // evaluates against the new card's own add-time, not the
    // previous card's. Writes to the OWNER's row (the payer, if
    // we pivoted) because that's where defaultPaymentMethodId
    // lives for the family billing.
    if (ownerDefaultPaymentMethodId === paymentMethodId) {
      await prisma.member.update({
        where: { id: ownerMemberId },
        data: { defaultPaymentMethodId: null, defaultPaymentMethodSetAt: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing payment method:", error);
    const message = error instanceof Error ? error.message : "Failed to remove card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
