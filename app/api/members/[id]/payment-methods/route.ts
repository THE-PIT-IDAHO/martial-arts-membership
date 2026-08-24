import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

// GET /api/members/[id]/payment-methods — list saved cards for a
// member. If a PAYS_FOR relationship exists (someone else pays this
// member's charges), returns the payer's cards instead + a
// `paidByMember` reference so the caller can label it "on behalf of
// so-and-so". Matches the fallback the auto-billing cron + POS
// charge-saved-card endpoint already do; ensures POS presents the
// same card the charge will actually hit.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: memberId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true, defaultPaymentMethodId: true },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Look for a PAYS_FOR row where this member is the payee. If found,
  // pivot to the payer's card. Scoped to this tenant to prevent a
  // stray cross-tenant row from surfacing a foreign gym's card.
  const payerRow = await prisma.memberRelationship.findFirst({
    where: { relationship: "PAYS_FOR", toMemberId: memberId },
    select: {
      fromMemberId: true,
      fromMember: { select: { id: true, firstName: true, lastName: true, clientId: true } },
    },
  });
  const payerBelongsToTenant = !!payerRow?.fromMember && payerRow.fromMember.clientId === clientId;
  const billedMemberId = payerBelongsToTenant ? payerRow!.fromMemberId : memberId;
  const paidByMember = payerBelongsToTenant
    ? { id: payerRow!.fromMember!.id, firstName: payerRow!.fromMember!.firstName, lastName: payerRow!.fromMember!.lastName }
    : null;

  // Reload if we pivoted (need the payer's stripeCustomerId + default).
  const billedMember = billedMemberId === memberId
    ? member
    : await prisma.member.findUnique({
        where: { id: billedMemberId },
        select: { clientId: true, stripeCustomerId: true, defaultPaymentMethodId: true },
      });
  if (!billedMember || billedMember.clientId !== clientId) {
    return NextResponse.json({ paymentMethods: [], defaultId: null, paidByMember });
  }

  if (!billedMember.stripeCustomerId) {
    return NextResponse.json({ paymentMethods: [], defaultId: null, paidByMember });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ paymentMethods: [], defaultId: null, paidByMember });
  }

  try {
    const methods = await stripeClient.paymentMethods.list({
      customer: billedMember.stripeCustomerId,
      type: "card",
    });

    const paymentMethods = methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "unknown",
      last4: pm.card?.last4 || "****",
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));

    return NextResponse.json({
      paymentMethods,
      defaultId: billedMember.defaultPaymentMethodId,
      paidByMember,
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json({ error: "Failed to load payment methods" }, { status: 500 });
  }
}

// POST /api/members/[id]/payment-methods — create Stripe SetupIntent for embedded card form
export async function POST(_req: NextRequest, { params }: Params) {
  const { id: memberId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      clientId: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
    },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  // Get publishable key. Prefers per-tenant Settings (set by each gym in
  // Account → Payments); falls back to STRIPE_PUBLISHABLE_KEY env var.
  let publishableKey: string | undefined;
  const pkSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "payment_stripe_publishable_key", clientId } },
  });
  publishableKey = pkSetting?.value || undefined;
  if (!publishableKey) {
    publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  }
  if (!publishableKey) {
    return NextResponse.json({ error: "Stripe publishable key not configured" }, { status: 400 });
  }

  try {
    // Get or create Stripe customer
    let stripeCustomerId = member.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripeClient.customers.create({
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
        metadata: { memberId: member.id },
      });
      stripeCustomerId = customer.id;
      await prisma.member.update({
        where: { id: member.id },
        data: { stripeCustomerId },
      });
    }

    // Create SetupIntent for embedded card form
    const setupIntent = await stripeClient.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: { memberId: member.id },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      publishableKey,
      memberName: `${member.firstName} ${member.lastName}`,
      memberEmail: member.email || "",
    });
  } catch (error) {
    console.error("Error creating setup intent:", error);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
