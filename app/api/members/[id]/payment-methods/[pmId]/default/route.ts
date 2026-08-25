import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; pmId: string }> };

// PUT /api/members/[id]/payment-methods/[pmId]/default — set as default payment method
//
// PAYS_FOR pivot: if a PAYS_FOR relationship exists with THIS member
// as the payee (mother/father/spouse pays for me), route the save to
// the PAYER's Stripe customer + DB row instead of this member's.
// Matches how POS charges + auto-billing already pivot -- otherwise
// saving a card during a child's membership sale writes it to the
// child's (never-created-yet) Stripe customer while the recurring
// job charges the payer's customer, and the payer has no card on
// file so every renewal fails.
export async function PUT(_req: NextRequest, { params }: Params) {
  const { id: memberId, pmId: paymentMethodId } = await params;
  const clientId = await getClientId(_req);

  const payee = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true, email: true, firstName: true, lastName: true },
  });
  if (!payee || payee.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  // Resolve the actual card owner: PAYS_FOR payer if one exists,
  // otherwise this member.
  const payerRow = await prisma.memberRelationship.findFirst({
    where: { relationship: "PAYS_FOR", toMemberId: memberId },
    select: { fromMemberId: true },
  });
  let owner: {
    id: string;
    stripeCustomerId: string | null;
    email: string | null;
    firstName: string;
    lastName: string;
  } = { id: memberId, ...payee };
  if (payerRow) {
    const payer = await prisma.member.findFirst({
      where: { id: payerRow.fromMemberId, clientId },
      select: { id: true, stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });
    if (payer) owner = payer;
  }

  try {
    // Create the owner's Stripe customer on demand. Under PAYS_FOR
    // this member may never have hit a POS charge yet (all their
    // sales pivoted to the payer's already-existing customer), so
    // there's nothing here to attach to -- create it now, matching
    // create-payment-intent's own on-demand creation logic.
    let ownerCustomerId = owner.stripeCustomerId;
    if (!ownerCustomerId) {
      const customer = await stripeClient.customers.create({
        email: owner.email || undefined,
        name: `${owner.firstName} ${owner.lastName}`,
        metadata: { memberId: owner.id },
      });
      ownerCustomerId = customer.id;
      await prisma.member.update({
        where: { id: owner.id },
        data: { stripeCustomerId: ownerCustomerId },
      });
    }

    // A PM created via the embedded card modal is attached to no
    // customer by default now (the create-payment-intent route no
    // longer forces setup_future_usage: "off_session"). If it arrives
    // unattached, attach it to the OWNER's customer. If it's already
    // attached to that same customer (e.g. PaymentIntent auto-attached
    // during the charge), skip. Only refuse when it's attached to a
    // different customer altogether (a truly mixed-up PM).
    const pm = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== ownerCustomerId) {
      return NextResponse.json({ error: "Payment method belongs to a different member" }, { status: 403 });
    }
    if (!pm.customer) {
      await stripeClient.paymentMethods.attach(paymentMethodId, { customer: ownerCustomerId });
    }

    // Set as default on the OWNER's Stripe customer + write it to the
    // OWNER's DB row. Auto-billing reads defaultPaymentMethodId off
    // the payer, so this is where the card has to land.
    await stripeClient.customers.update(ownerCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    await prisma.member.update({
      where: { id: owner.id },
      data: { defaultPaymentMethodId: paymentMethodId },
    });

    return NextResponse.json({ success: true, savedOnMemberId: owner.id });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }
}
