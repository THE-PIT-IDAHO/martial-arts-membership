import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getActiveProcessor, ensureProcessorCustomer } from "@/lib/payment";
import { getStripeClient } from "@/lib/stripe";
import { getPayPalConfig, listPayPalVaultedTokens, createPayPalVaultSetupToken } from "@/lib/paypal";
import { getSquareConfig, listSquareCards } from "@/lib/square";

// GET /api/portal/payment-methods — list saved payment methods
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const processor = await getActiveProcessor();
  if (!processor) {
    return NextResponse.json({ paymentMethods: [], defaultId: null, processor: null });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      stripeCustomerId: true,
      defaultPaymentMethodId: true,
      paypalPayerId: true,
      squareCustomerId: true,
    },
  });

  if (!member) {
    return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
  }

  try {
    if (processor === "stripe") {
      if (!member.stripeCustomerId) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const stripeClient = await getStripeClient();
      if (!stripeClient) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const methods = await stripeClient.paymentMethods.list({
        customer: member.stripeCustomerId,
        type: "card",
      });
      const paymentMethods = methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || "unknown",
        last4: pm.card?.last4 || "****",
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        type: "card" as const,
      }));
      return NextResponse.json({
        paymentMethods,
        defaultId: member.defaultPaymentMethodId,
        processor,
      });
    }

    if (processor === "paypal") {
      if (!member.paypalPayerId) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const config = await getPayPalConfig();
      if (!config) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const tokens = await listPayPalVaultedTokens(config, member.paypalPayerId);
      const paymentMethods = tokens.map((t) => ({
        id: t.id,
        brand: "paypal",
        last4: t.payerEmail?.slice(-8) || "PayPal",
        type: "paypal" as const,
      }));
      return NextResponse.json({
        paymentMethods,
        defaultId: member.defaultPaymentMethodId,
        processor,
      });
    }

    if (processor === "square") {
      if (!member.squareCustomerId) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const config = await getSquareConfig();
      if (!config) {
        return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
      }
      const cards = await listSquareCards(config, member.squareCustomerId);
      const paymentMethods = cards.map((c) => ({
        id: c.id,
        brand: c.brand.toLowerCase(),
        last4: c.last4,
        expMonth: c.expMonth,
        expYear: c.expYear,
        type: "card" as const,
      }));
      return NextResponse.json({
        paymentMethods,
        defaultId: member.defaultPaymentMethodId,
        processor,
      });
    }

    return NextResponse.json({ paymentMethods: [], defaultId: null, processor });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json({ error: "Failed to load payment methods" }, { status: 500 });
  }
}

// POST /api/portal/payment-methods — add a new payment method
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const processor = await getActiveProcessor();
  if (!processor) {
    return NextResponse.json({ error: "No payment processor configured" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
      paypalPayerId: true,
      squareCustomerId: true,
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  try {
    if (processor === "stripe") {
      const stripeClient = await getStripeClient();
      if (!stripeClient) {
        return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
      }

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

      const session = await stripeClient.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "setup",
        payment_method_types: ["card"],
        success_url: `${baseUrl}/portal/memberships?setup=success`,
        cancel_url: `${baseUrl}/portal/memberships`,
        metadata: { memberId: member.id },
      });

      return NextResponse.json({ url: session.url });
    }

    if (processor === "paypal") {
      const config = await getPayPalConfig();
      if (!config) {
        return NextResponse.json({ error: "PayPal is not configured" }, { status: 400 });
      }

      const result = await createPayPalVaultSetupToken({
        config,
        returnUrl: `${baseUrl}/portal/memberships?setup=success`,
        cancelUrl: `${baseUrl}/portal/memberships`,
        customerId: member.paypalPayerId || undefined,
      });

      return NextResponse.json({ url: result.approvalUrl, setupTokenId: result.setupTokenId });
    }

    if (processor === "square") {
      // Square requires Web Payments SDK on the frontend for card nonce.
      // For now, return the application ID so the frontend can initialize the SDK.
      const config = await getSquareConfig();
      if (!config) {
        return NextResponse.json({ error: "Square is not configured" }, { status: 400 });
      }

      // Ensure Square customer exists
      const customerId = await ensureProcessorCustomer({
        memberId: member.id,
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
      });

      return NextResponse.json({
        mode: "square_web_payments",
        applicationId: config.applicationId,
        locationId: config.locationId,
        customerId,
        sandbox: config.sandbox,
      });
    }

    return NextResponse.json({ error: "Unknown processor" }, { status: 400 });
  } catch (error) {
    console.error("Error creating payment setup:", error);
    return NextResponse.json({ error: "Failed to create setup session" }, { status: 500 });
  }
}
