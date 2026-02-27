import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import {
  getActiveProcessor,
  createCheckoutSession,
  getCurrency,
  type ProcessorType,
} from "@/lib/payment";
import { getStripeClient } from "@/lib/stripe";

/**
 * POST /api/pos/checkout — Unified POS card checkout
 * Routes to the active payment processor (Stripe, PayPal, or Square).
 * Accepts the same body as the old /api/pos/stripe-checkout route.
 */
export async function POST(req: Request) {
  await getClientId(req); // validate tenant
  const body = await req.json();
  const {
    memberId,
    memberName,
    lineItems,
    notes,
    discountCents,
    taxCents,
    serviceDiscountCents,
    productDiscountCents,
    redeemedGiftCode,
    redeemedGiftAmountCents,
    cardAmountCents,
    transactionId,
  } = body;

  const processor = await getActiveProcessor();
  if (!processor) {
    return NextResponse.json({ error: "No payment processor configured" }, { status: 400 });
  }

  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const currency = await getCurrency();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const isSplitPayment = typeof cardAmountCents === "number" && cardAmountCents > 0;

  // Build metadata for webhook processing
  const metadata: Record<string, string> = {
    source: "admin_pos",
    cartItems: JSON.stringify(lineItems),
    ...(memberId ? { memberId } : {}),
    ...(memberName ? { memberName } : {}),
    ...(notes ? { notes } : {}),
    ...(discountCents ? { discountCents: String(discountCents) } : {}),
    ...(taxCents ? { taxCents: String(taxCents) } : {}),
    ...(serviceDiscountCents ? { serviceDiscountCents: String(serviceDiscountCents) } : {}),
    ...(productDiscountCents ? { productDiscountCents: String(productDiscountCents) } : {}),
    ...(redeemedGiftCode ? { redeemedGiftCode } : {}),
    ...(redeemedGiftAmountCents ? { redeemedGiftAmountCents: String(redeemedGiftAmountCents) } : {}),
    ...(transactionId ? { transactionId } : {}),
  };

  // For split payments or simple single-amount charges, use unified abstraction
  if (isSplitPayment) {
    const result = await createCheckoutSession({
      amountCents: cardAmountCents,
      currency,
      description: "Card Payment (Split)",
      successUrl: `${baseUrl}/pos?payment_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/pos?payment_cancel=1`,
      memberId,
      metadata,
    });

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      orderId: result.orderId,
      processor: result.processor,
    });
  }

  // Full cart checkout — Stripe gets detailed line items, others get total amount
  if (processor === "stripe") {
    // Delegate to Stripe-specific route for detailed line items + tax rates
    return handleStripeFullCheckout({
      memberId,
      memberName,
      lineItems,
      discountCents,
      taxCents,
      serviceDiscountCents,
      productDiscountCents,
      redeemedGiftCode,
      redeemedGiftAmountCents,
      currency,
      baseUrl,
      metadata,
    });
  }

  // PayPal & Square: calculate total and create checkout session
  const subtotalCents = lineItems.reduce(
    (sum: number, item: { unitPriceCents: number; customPriceCents?: number; quantity: number; discountCents?: number }) => {
      const unitPrice = item.customPriceCents ?? item.unitPriceCents;
      const itemDiscount = item.discountCents || 0;
      return sum + unitPrice * item.quantity - itemDiscount;
    },
    0
  );

  const totalSectionDiscount = (serviceDiscountCents || 0) + (productDiscountCents || 0);
  const giftRedemption = redeemedGiftAmountCents || 0;
  const totalCents = Math.max(0, subtotalCents - totalSectionDiscount - giftRedemption + (taxCents || 0));

  const result = await createCheckoutSession({
    amountCents: totalCents,
    currency,
    description: `POS Sale${memberName ? ` — ${memberName}` : ""}`,
    successUrl: `${baseUrl}/pos?payment_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/pos?payment_cancel=1`,
    memberId,
    metadata,
  });

  return NextResponse.json({
    url: result.url,
    sessionId: result.sessionId,
    orderId: result.orderId,
    processor: result.processor,
  });
}

/** Stripe-specific full checkout with detailed line items and tax rates */
async function handleStripeFullCheckout(params: {
  memberId?: string;
  memberName?: string;
  lineItems: Array<Record<string, unknown>>;
  discountCents?: number;
  taxCents?: number;
  serviceDiscountCents?: number;
  productDiscountCents?: number;
  redeemedGiftCode?: string;
  redeemedGiftAmountCents?: number;
  currency: string;
  baseUrl: string;
  metadata: Record<string, string>;
}) {
  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const stripeLineItems: Array<{
    price_data: {
      currency: string;
      product_data: { name: string; description?: string };
      unit_amount: number;
    };
    quantity: number;
  }> = [];

  for (const item of params.lineItems) {
    const name = (item.itemName as string) || (item.type as string);
    const unitPrice = (item.customPriceCents as number) ?? (item.unitPriceCents as number);
    const discPerUnit = item.discountCents
      ? Math.round((item.discountCents as number) / (item.quantity as number))
      : 0;
    const finalUnitPrice = Math.max(0, unitPrice - discPerUnit);

    stripeLineItems.push({
      price_data: {
        currency: params.currency,
        product_data: {
          name,
          ...(item.itemSku ? { description: `SKU: ${item.itemSku}` } : {}),
        },
        unit_amount: finalUnitPrice,
      },
      quantity: (item.quantity as number) || 1,
    });
  }

  const totalSectionDiscount =
    (params.serviceDiscountCents || 0) + (params.productDiscountCents || 0);
  if (totalSectionDiscount > 0) {
    stripeLineItems.push({
      price_data: {
        currency: params.currency,
        product_data: { name: "Discount" },
        unit_amount: -totalSectionDiscount,
      },
      quantity: 1,
    });
  }

  if (params.redeemedGiftAmountCents && params.redeemedGiftAmountCents > 0) {
    stripeLineItems.push({
      price_data: {
        currency: params.currency,
        product_data: { name: "Gift Certificate Redemption" },
        unit_amount: -params.redeemedGiftAmountCents,
      },
      quantity: 1,
    });
  }

  // Tax rate
  const taxSetting = await prisma.settings.findFirst({ where: { key: "taxRate" } });
  const taxRatePercent = taxSetting ? Number(taxSetting.value) : 0;

  let finalLineItems = stripeLineItems.map((li) => ({ ...li }));

  if (taxRatePercent > 0 && (params.taxCents || 0) > 0) {
    const taxRates = await stripeClient.taxRates.list({ limit: 20, active: true });
    let taxRate = taxRates.data.find(
      (t) => t.percentage === taxRatePercent && !t.inclusive
    );
    if (!taxRate) {
      taxRate = await stripeClient.taxRates.create({
        display_name: "Sales Tax",
        percentage: taxRatePercent,
        inclusive: false,
      });
    }
    finalLineItems = stripeLineItems.map((li) => ({
      ...li,
      ...(li.price_data.unit_amount > 0 ? { tax_rates: [taxRate!.id] } : {}),
    }));
  }

  // Customer
  let stripeCustomerId: string | undefined;
  if (params.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: params.memberId },
      select: { stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });
    if (member?.stripeCustomerId) {
      stripeCustomerId = member.stripeCustomerId;
    } else if (member) {
      const customer = await stripeClient.customers.create({
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
        metadata: { memberId: params.memberId },
      });
      stripeCustomerId = customer.id;
      await prisma.member.update({
        where: { id: params.memberId },
        data: { stripeCustomerId: customer.id },
      });
    }
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "payment",
    line_items: finalLineItems,
    success_url: `${params.baseUrl}/pos?payment_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.baseUrl}/pos?payment_cancel=1`,
    ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
    metadata: params.metadata,
  });

  return NextResponse.json({
    url: session.url,
    sessionId: session.id,
    processor: "stripe",
  });
}
