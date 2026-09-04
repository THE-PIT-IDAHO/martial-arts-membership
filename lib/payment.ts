import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import {
  getPayPalConfig,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderStatus,
  refundPayPalCapture,
  chargePayPalVaultedToken,
} from "@/lib/paypal";
import {
  getSquareConfig,
  createSquarePaymentLink,
  getSquarePaymentLinkOrder,
  refundSquarePayment,
  chargeSquareStoredCard,
  getOrCreateSquareCustomer,
} from "@/lib/square";
import { calculateNextPaymentDate } from "@/lib/billing";
import { buildMembershipSignupExtras } from "@/lib/membership-signup-extras";
import { calculateContractEndDate } from "@/lib/contracts";

export type ProcessorType = "stripe" | "paypal" | "square";

// ---------------------------------------------------------------------------
// Active processor detection
// ---------------------------------------------------------------------------

// Every processor / credential / currency lookup in this file requires
// a tenant clientId. Without it, findFirst-style lookups would pick
// whichever tenant's Settings row sorted first -- meaning gym A's
// charge could route through gym B's Stripe key. That was the single
// most severe leak the audit found before launch.
export async function getActiveProcessor(clientId: string): Promise<ProcessorType | null> {
  const row = await prisma.settings.findUnique({
    where: { key_clientId: { key: "payment_active_processor", clientId } },
  });
  if (row?.value && row.value !== "none") {
    return row.value as ProcessorType;
  }
  // Backward compat: if no active_processor set, check individual enabled flags
  const enabled = await prisma.settings.findMany({
    where: {
      clientId,
      key: {
        in: [
          "payment_stripe_enabled",
          "payment_paypal_enabled",
          "payment_square_enabled",
        ],
      },
    },
  });
  const map = new Map(enabled.map((r) => [r.key, r.value]));
  if (map.get("payment_stripe_enabled") === "true") return "stripe";
  if (map.get("payment_paypal_enabled") === "true") return "paypal";
  if (map.get("payment_square_enabled") === "true") return "square";
  return null;
}

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

export type CheckoutSessionParams = {
  clientId: string; // REQUIRED: which tenant's payment processor to use
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  lineItems?: Array<{
    name: string;
    description?: string;
    amountCents: number;
    quantity: number;
  }>;
  customerId?: string; // processor-specific customer ID
  memberId?: string;
  memberName?: string;
  memberEmail?: string;
  metadata?: Record<string, string>;
  taxRatePercent?: number;
};

export type CheckoutSessionResult = {
  url: string;
  sessionId: string;
  orderId?: string;
  processor: ProcessorType;
};

export async function createCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const processor = await getActiveProcessor(params.clientId);
  if (!processor) throw new Error("No payment processor configured");

  if (processor === "stripe") {
    return createStripeCheckoutSession(params);
  } else if (processor === "paypal") {
    return createPayPalCheckoutSession(params);
  } else {
    return createSquareCheckoutSession(params);
  }
}

async function createStripeCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const stripeClient = await getStripeClient(params.clientId);
  if (!stripeClient) throw new Error("Stripe is not configured");

  // Get or create Stripe customer
  let customer: string | undefined = params.customerId;
  if (!customer && params.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: params.memberId },
      select: { stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });
    if (member?.stripeCustomerId) {
      customer = member.stripeCustomerId;
    } else if (member) {
      const cust = await stripeClient.customers.create({
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
        metadata: { memberId: params.memberId },
      });
      customer = cust.id;
      await prisma.member.update({
        where: { id: params.memberId },
        data: { stripeCustomerId: cust.id },
      });
    }
  }

  // Build line items
  let lineItems;
  if (params.lineItems && params.lineItems.length > 0) {
    lineItems = params.lineItems.map((li) => ({
      price_data: {
        currency: params.currency.toLowerCase(),
        product_data: {
          name: li.name,
          ...(li.description ? { description: li.description } : {}),
        },
        unit_amount: li.amountCents,
      },
      quantity: li.quantity,
    }));
  } else {
    lineItems = [
      {
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: { name: params.description },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      },
    ];
  }

  // Tax rate handling
  if (params.taxRatePercent && params.taxRatePercent > 0) {
    const taxRates = await stripeClient.taxRates.list({ limit: 20, active: true });
    let taxRate = taxRates.data.find(
      (t) => t.percentage === params.taxRatePercent && !t.inclusive
    );
    if (!taxRate) {
      taxRate = await stripeClient.taxRates.create({
        display_name: "Sales Tax",
        percentage: params.taxRatePercent,
        inclusive: false,
      });
    }
    lineItems = lineItems.map((li) => ({
      ...li,
      tax_rates: [taxRate!.id],
    }));
  }

  const session = await stripeClient.checkout.sessions.create({
    ...(customer ? { customer } : {}),
    mode: "payment",
    line_items: lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    // Always inject clientId into the Stripe metadata so the webhook
    // handler can resolve tenant when the payment completes. Without
    // this, the webhook falls back to "default-client" and any tenant
    // lookup it does is wrong.
    metadata: { ...(params.metadata || {}), clientId: params.clientId },
  });

  return {
    url: session.url!,
    sessionId: session.id,
    processor: "stripe",
  };
}

async function createPayPalCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const config = await getPayPalConfig(params.clientId);
  if (!config) throw new Error("PayPal is not configured");

  // Encode metadata in custom_id (max 127 chars). Always include the
  // tenant clientId so the PayPal webhook can resolve it back.
  const withTenant = { ...(params.metadata || {}), clientId: params.clientId };
  const customId = JSON.stringify(withTenant).slice(0, 127);

  const result = await createPayPalOrder({
    config,
    amountCents: params.amountCents,
    currency: params.currency,
    description: params.description,
    returnUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    customId,
  });

  return {
    url: result.approvalUrl,
    sessionId: result.orderId,
    processor: "paypal",
  };
}

async function createSquareCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const config = await getSquareConfig(params.clientId);
  if (!config) throw new Error("Square is not configured");

  // Always include tenant clientId in the note so the Square
  // webhook can resolve it back.
  const withTenant = { ...(params.metadata || {}), clientId: params.clientId };
  const result = await createSquarePaymentLink({
    config,
    amountCents: params.amountCents,
    currency: params.currency,
    description: params.description,
    redirectUrl: params.successUrl,
    note: JSON.stringify(withTenant),
    referenceId: params.metadata?.transactionId || params.metadata?.invoiceId,
  });

  return {
    url: result.url,
    sessionId: result.paymentLinkId,
    orderId: result.orderId,
    processor: "square",
  };
}

// ---------------------------------------------------------------------------
// Checkout status polling
// ---------------------------------------------------------------------------

export type CheckoutStatusResult = {
  status: "pending" | "complete" | "expired" | "failed";
  externalPaymentId?: string;
  metadata?: Record<string, string>;
};

export async function getCheckoutStatus(
  clientId: string,
  sessionId: string,
  orderId?: string
): Promise<CheckoutStatusResult> {
  const processor = await getActiveProcessor(clientId);
  if (!processor) return { status: "failed" };

  if (processor === "stripe") {
    return getStripeCheckoutStatus(clientId, sessionId);
  } else if (processor === "paypal") {
    return getPayPalCheckoutStatus(clientId, sessionId);
  } else {
    return getSquareCheckoutStatus(clientId, orderId || sessionId);
  }
}

async function getStripeCheckoutStatus(
  clientId: string,
  sessionId: string
): Promise<CheckoutStatusResult> {
  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) return { status: "failed" };

  const session = await stripeClient.checkout.sessions.retrieve(sessionId);

  if (session.status === "complete") {
    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    return {
      status: "complete",
      externalPaymentId: piId || session.id,
      metadata: (session.metadata as Record<string, string>) || undefined,
    };
  }
  if (session.status === "expired") return { status: "expired" };
  return { status: "pending" };
}

async function getPayPalCheckoutStatus(
  clientId: string,
  orderId: string
): Promise<CheckoutStatusResult> {
  const config = await getPayPalConfig(clientId);
  if (!config) return { status: "failed" };

  const orderStatus = await getPayPalOrderStatus(config, orderId);

  if (orderStatus.status === "APPROVED") {
    // Capture the payment
    const capture = await capturePayPalOrder(config, orderId);
    return {
      status: "complete",
      externalPaymentId: capture.captureId,
    };
  }
  if (orderStatus.status === "COMPLETED") {
    return {
      status: "complete",
      externalPaymentId: orderStatus.captureId || orderId,
    };
  }
  if (orderStatus.status === "VOIDED") return { status: "expired" };
  return { status: "pending" };
}

async function getSquareCheckoutStatus(
  clientId: string,
  orderId: string
): Promise<CheckoutStatusResult> {
  const config = await getSquareConfig(clientId);
  if (!config) return { status: "failed" };

  const order = await getSquarePaymentLinkOrder(config, orderId);

  if (order.status === "COMPLETED") {
    return {
      status: "complete",
      externalPaymentId: order.paymentId || orderId,
    };
  }
  if (order.status === "CANCELED") return { status: "expired" };
  return { status: "pending" };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function createRefund(
  clientId: string,
  externalPaymentId: string,
  processor: ProcessorType,
  amountCents?: number,
  currency?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (processor === "stripe") {
      const stripeClient = await getStripeClient(clientId);
      if (!stripeClient)
        return { success: false, error: "Stripe not configured" };
      await stripeClient.refunds.create({
        payment_intent: externalPaymentId,
      });
      return { success: true };
    }

    if (processor === "paypal") {
      const config = await getPayPalConfig(clientId);
      if (!config)
        return { success: false, error: "PayPal not configured" };
      // externalPaymentId is the capture ID for PayPal
      await refundPayPalCapture(config, externalPaymentId, amountCents, currency);
      return { success: true };
    }

    if (processor === "square") {
      const config = await getSquareConfig(clientId);
      if (!config)
        return { success: false, error: "Square not configured" };
      if (!amountCents || !currency)
        return { success: false, error: "Amount and currency required for Square refund" };
      await refundSquarePayment({
        config,
        paymentId: externalPaymentId,
        amountCents,
        currency,
      });
      return { success: true };
    }

    return { success: false, error: "Unknown processor" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund failed";
    console.error(`${processor} refund failed:`, err);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Charge stored payment method (off-session: auto-billing, dunning)
// ---------------------------------------------------------------------------

export async function chargeStoredPaymentMethod(params: {
  memberId: string;
  amountCents: number;
  currency: string;
  description?: string;
  invoiceId?: string;
}): Promise<{ success: boolean; externalPaymentId?: string; processor?: ProcessorType; error?: string }> {
  // Resolve the caller-tenant from the member, then use that clientId
  // for EVERY processor / credential lookup below. This is what makes
  // sure gym A's charge routes to gym A's Stripe/PayPal/Square keys
  // regardless of what other tenants have configured.
  const memberTenant = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { clientId: true },
  });
  if (!memberTenant) return { success: false, error: "Member not found" };
  const clientId = memberTenant.clientId;

  const processor = await getActiveProcessor(clientId);
  if (!processor) return { success: false, error: "No processor configured" };

  // Resolve who actually gets billed. By default it's the member themselves,
  // but if a PAYS_FOR relationship exists (someone else is marked as paying
  // for this member in the profile Account Summary), the payer's saved card
  // is charged instead. Lets a spouse/parent/etc. cover a member's bills
  // without having to attach the same card to multiple profiles.
  const payerRow = await prisma.memberRelationship.findFirst({
    where: { relationship: "PAYS_FOR", toMemberId: params.memberId },
    select: { fromMemberId: true },
  });
  const billedMemberId = payerRow?.fromMemberId || params.memberId;

  const member = await prisma.member.findUnique({
    where: { id: billedMemberId },
    select: {
      clientId: true,
      stripeCustomerId: true,
      defaultPaymentMethodId: true,
      paypalPayerId: true,
      squareCustomerId: true,
    },
  });
  if (!member) return { success: false, error: "Member not found" };
  // Refuse to charge a payer in a different tenant -- defense in
  // depth against a stray cross-tenant PAYS_FOR relationship.
  if (member.clientId !== clientId) {
    return { success: false, error: "Payer not in this tenant" };
  }

  try {
    if (processor === "stripe") {
      if (!member.stripeCustomerId || !member.defaultPaymentMethodId) {
        return { success: false, error: "No stored Stripe payment method" };
      }
      const stripeClient = await getStripeClient(clientId);
      if (!stripeClient) return { success: false, error: "Stripe not configured" };

      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        customer: member.stripeCustomerId,
        payment_method: member.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
          memberId: params.memberId,
          // billedMemberId differs from memberId when a PAYS_FOR
          // relationship redirected the charge to a payer's card.
          ...(billedMemberId !== params.memberId ? { billedMemberId } : {}),
        },
      });

      if (paymentIntent.status === "succeeded") {
        return {
          success: true,
          externalPaymentId: paymentIntent.id,
          processor: "stripe",
        };
      }
      return { success: false, error: `Payment status: ${paymentIntent.status}` };
    }

    if (processor === "paypal") {
      if (!member.defaultPaymentMethodId) {
        return { success: false, error: "No stored PayPal payment token" };
      }
      const config = await getPayPalConfig(clientId);
      if (!config) return { success: false, error: "PayPal not configured" };

      const result = await chargePayPalVaultedToken({
        config,
        paymentTokenId: member.defaultPaymentMethodId,
        amountCents: params.amountCents,
        currency: params.currency,
        description: params.description || "Membership payment",
        customId: params.invoiceId,
      });

      if (result.status === "COMPLETED") {
        return {
          success: true,
          externalPaymentId: result.captureId,
          processor: "paypal",
        };
      }
      return { success: false, error: `PayPal status: ${result.status}` };
    }

    if (processor === "square") {
      if (!member.squareCustomerId || !member.defaultPaymentMethodId) {
        return { success: false, error: "No stored Square card" };
      }
      const config = await getSquareConfig(clientId);
      if (!config) return { success: false, error: "Square not configured" };

      const result = await chargeSquareStoredCard({
        config,
        customerId: member.squareCustomerId,
        cardId: member.defaultPaymentMethodId,
        amountCents: params.amountCents,
        currency: params.currency,
        note: params.description,
        referenceId: params.invoiceId,
      });

      if (result.status === "COMPLETED") {
        return {
          success: true,
          externalPaymentId: result.paymentId,
          processor: "square",
        };
      }
      return { success: false, error: `Square status: ${result.status}` };
    }

    return { success: false, error: "Unknown processor" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Charge failed";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Ensure processor customer exists (create if needed)
// ---------------------------------------------------------------------------

export async function ensureProcessorCustomer(params: {
  memberId: string;
  email?: string;
  name: string;
}): Promise<string | null> {
  // Same pattern as chargeStoredPaymentMethod: resolve tenant from
  // the member so every processor lookup below uses THIS gym's keys.
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { clientId: true, stripeCustomerId: true, paypalPayerId: true, squareCustomerId: true },
  });
  if (!member) return null;
  const clientId = member.clientId;

  const processor = await getActiveProcessor(clientId);
  if (!processor) return null;

  if (processor === "stripe") {
    if (member.stripeCustomerId) return member.stripeCustomerId;
    const stripeClient = await getStripeClient(clientId);
    if (!stripeClient) return null;
    const cust = await stripeClient.customers.create({
      email: params.email || undefined,
      name: params.name,
      metadata: { memberId: params.memberId },
    });
    await prisma.member.update({
      where: { id: params.memberId },
      data: { stripeCustomerId: cust.id },
    });
    return cust.id;
  }

  if (processor === "paypal") {
    // PayPal customer IDs come from the vault flow
    return member.paypalPayerId || null;
  }

  if (processor === "square") {
    if (member.squareCustomerId) return member.squareCustomerId;
    const config = await getSquareConfig(clientId);
    if (!config) return null;
    const custId = await getOrCreateSquareCustomer({
      config,
      memberId: params.memberId,
      email: params.email,
      name: params.name,
    });
    await prisma.member.update({
      where: { id: params.memberId },
      data: { squareCustomerId: custId },
    });
    return custId;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared webhook business logic
// ---------------------------------------------------------------------------

/**
 * Handle a completed checkout payment from any processor.
 * Covers: split payment linking, portal invoice payment, admin POS, portal store.
 */
export async function handleCheckoutCompleted(params: {
  externalPaymentId: string;
  processor: ProcessorType;
  metadata: Record<string, string>;
  amountTotalCents?: number;
  taxCents?: number;
}): Promise<void> {
  const { externalPaymentId, processor, metadata } = params;

  // Idempotency check
  const existing = await prisma.pOSTransaction.findFirst({
    where: { paymentIntentId: externalPaymentId },
  });
  if (existing) return;

  const processorLabel = processor.toUpperCase();

  // Split payment: transaction already created locally, just link payment
  if (metadata.transactionId) {
    await prisma.pOSTransaction.update({
      where: { id: metadata.transactionId },
      data: {
        paymentIntentId: externalPaymentId,
        paymentProcessor: processor,
        updatedAt: new Date(),
      },
    });
    if (metadata.invoiceId) {
      await prisma.invoice.update({
        where: { id: metadata.invoiceId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentMethod: processorLabel,
          externalPaymentId,
          paymentProcessor: processor,
          ...(processor === "stripe" ? { stripePaymentIntentId: externalPaymentId } : {}),
        },
      });
    }
    return;
  }

  // Portal invoice payment
  if (metadata.source === "portal_invoice_pay" && metadata.invoiceId) {
    await prisma.invoice.update({
      where: { id: metadata.invoiceId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: processorLabel,
        externalPaymentId,
        paymentProcessor: processor,
        ...(processor === "stripe" ? { stripePaymentIntentId: externalPaymentId } : {}),
      },
    });
    return;
  }

  // Admin POS checkout — create full transaction from metadata
  if (metadata.source === "admin_pos") {
    await processAdminPOSCheckout({
      externalPaymentId,
      processor,
      metadata,
      amountTotalCents: params.amountTotalCents,
      taxCents: params.taxCents,
    });
    return;
  }

  // Portal store checkout — create transaction from cart
  if (metadata.cartItems) {
    await processPortalStoreCheckout({
      externalPaymentId,
      processor,
      metadata,
      amountTotalCents: params.amountTotalCents,
      taxCents: params.taxCents,
    });
    return;
  }

  // If metadata contains invoiceId, mark it paid
  if (metadata.invoiceId) {
    await prisma.invoice.update({
      where: { id: metadata.invoiceId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: processorLabel,
        externalPaymentId,
        paymentProcessor: processor,
        ...(processor === "stripe" ? { stripePaymentIntentId: externalPaymentId } : {}),
      },
    });
  }
}

/**
 * Process admin POS checkout from webhook metadata.
 */
async function processAdminPOSCheckout(params: {
  externalPaymentId: string;
  processor: ProcessorType;
  metadata: Record<string, string>;
  amountTotalCents?: number;
  taxCents?: number;
}): Promise<void> {
  const { externalPaymentId, processor, metadata } = params;
  const processorLabel = processor.toUpperCase();

  // Require the tenant clientId in the metadata that the checkout
  // session was created with. Bail if it's missing rather than
  // dropping the transaction to the default-client bucket.
  const clientId = metadata.clientId;
  if (!clientId) {
    console.error("processAdminPOSCheckout: missing clientId in metadata; refusing to process", { externalPaymentId });
    return;
  }

  const memberId = metadata.memberId || null;
  const memberName = metadata.memberName || null;
  const notes = metadata.notes || null;
  const discountCents = parseInt(metadata.discountCents || "0") || 0;
  const taxCents = parseInt(metadata.taxCents || "0") || 0;
  const serviceDiscountCents = parseInt(metadata.serviceDiscountCents || "0") || 0;
  const productDiscountCents = parseInt(metadata.productDiscountCents || "0") || 0;
  const redeemedGiftCode = metadata.redeemedGiftCode || null;
  const redeemedGiftAmountCents = parseInt(metadata.redeemedGiftAmountCents || "0") || 0;

  const cartItems = JSON.parse(metadata.cartItems || "[]");
  if (cartItems.length === 0) return;

  const lineItemsData = cartItems.map((item: Record<string, unknown>) => {
    const itemDiscountCents = (item.discountCents as number) || 0;
    const unitPrice = ((item.customPriceCents as number) ?? (item.unitPriceCents as number)) || 0;
    return {
      id: crypto.randomUUID(),
      itemId: (item.itemId as string) || null,
      itemName: (item.itemName as string) || (item.type as string),
      itemSku: (item.itemSku as string) || null,
      type: (item.type as string) || "product",
      membershipPlanId: (item.membershipPlanId as string) || null,
      variantInfo:
        item.selectedSize || item.selectedColor
          ? JSON.stringify({ size: item.selectedSize || null, color: item.selectedColor || null })
          : null,
      quantity: (item.quantity as number) || 1,
      unitPriceCents: unitPrice,
      subtotalCents: unitPrice * ((item.quantity as number) || 1) - itemDiscountCents,
    };
  });

  const subtotalCents = lineItemsData.reduce(
    (sum: number, li: { subtotalCents: number }) => sum + li.subtotalCents,
    0
  );
  const totalDiscount = discountCents + serviceDiscountCents + productDiscountCents;
  const totalCents =
    params.amountTotalCents || Math.max(0, subtotalCents - totalDiscount + taxCents);

  const transactionNumber = `TXN-${Date.now()}`;
  await prisma.pOSTransaction.create({
    data: {
      id: crypto.randomUUID(),
      transactionNumber,
      memberId,
      memberName,
      subtotalCents,
      taxCents,
      discountCents: totalDiscount,
      totalCents,
      paymentMethod: processorLabel,
      status: "COMPLETED",
      paymentIntentId: externalPaymentId,
      paymentProcessor: processor,
      notes,
      clientId,
      updatedAt: new Date(),
      POSLineItem: {
        create: lineItemsData.map(
          (li: {
            id: string;
            itemId: string | null;
            itemName: string;
            itemSku: string | null;
            type: string;
            membershipPlanId: string | null;
            variantInfo: string | null;
            quantity: number;
            unitPriceCents: number;
            subtotalCents: number;
          }) => ({
            id: li.id,
            itemId: li.itemId,
            itemName: li.itemName,
            itemSku: li.itemSku,
            type: li.type,
            membershipPlanId: li.membershipPlanId,
            variantInfo: li.variantInfo,
            quantity: li.quantity,
            unitPriceCents: li.unitPriceCents,
            subtotalCents: li.subtotalCents,
          })
        ),
      },
    },
  });

  // Process inventory, memberships, credit, gifts
  for (const item of cartItems) {
    const itemType = item.type as string;

    if (itemType === "product" && item.itemId) {
      if (item.selectedSize || item.selectedColor) {
        const variant = await prisma.pOSItemVariant.findFirst({
          where: {
            itemId: item.itemId as string,
            size: (item.selectedSize as string) || null,
            color: (item.selectedColor as string) || null,
          },
        });
        if (variant) {
          await prisma.pOSItemVariant.update({
            where: { id: variant.id },
            data: { quantity: { decrement: (item.quantity as number) || 1 } },
          });
        }
      }
      await prisma.pOSItem.update({
        where: { id: item.itemId as string },
        data: {
          quantity: { decrement: (item.quantity as number) || 1 },
          updatedAt: new Date(),
        },
      });
    }

    if (itemType === "membership" && memberId && item.membershipPlanId) {
      // Scope plan lookup to this tenant so a spoofed cart item id
      // can't attach a foreign plan to our member (auto-billing
      // would then charge that plan's price on the next cycle).
      const plan = await prisma.membershipPlan.findFirst({
        where: { id: item.membershipPlanId as string, clientId },
      });
      if (plan) {
        const startDate = item.membershipStartDate
          ? new Date(item.membershipStartDate as string + "T12:00:00")
          : new Date();
        const endDate = item.membershipEndDate
          ? new Date(item.membershipEndDate as string + "T23:59:59")
          : null;
        const nextPaymentDate = !endDate
          ? calculateNextPaymentDate(startDate, plan.billingCycle)
          : null;
        const contractEndDate = plan.contractLengthMonths
          ? calculateContractEndDate(startDate, plan.contractLengthMonths)
          : null;
        const signupExtras = buildMembershipSignupExtras(plan, startDate, contractEndDate);

        await prisma.membership.create({
          data: {
            memberId,
            membershipPlanId: plan.id,
            status: "ACTIVE",
            startDate,
            endDate,
            nextPaymentDate,
            contractEndDate,
            customPriceCents: (item.customPriceCents as number) || null,
            firstPaymentCents: (item.unitPriceCents as number) ?? null,
            firstMonthDiscountOnly: (item.firstMonthDiscountOnly as boolean) || false,
            ...(signupExtras.remainingClassCredits !== undefined && {
              remainingClassCredits: signupExtras.remainingClassCredits,
            }),
            ...(signupExtras.creditsExpireAt !== undefined && {
              creditsExpireAt: signupExtras.creditsExpireAt,
            }),
          },
        });

        await prisma.member.update({
          where: { id: memberId },
          data: { status: { set: "ACTIVE" } },
        });
      }
    }

    if (itemType === "credit" && memberId) {
      const creditCents = ((item.unitPriceCents as number) || 0) * ((item.quantity as number) || 1);
      await prisma.member.update({
        where: { id: memberId },
        data: { accountCreditCents: { increment: creditCents } },
      });
    }

    if (itemType === "gift") {
      const giftCents = ((item.unitPriceCents as number) || 0) * ((item.quantity as number) || 1);
      const code = `GC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await prisma.giftCertificate.create({
        data: {
          code,
          amountCents: giftCents,
          balanceCents: giftCents,
          purchasedBy: memberName || "POS",
          recipientName: (item.recipientName as string) || null,
          status: "ACTIVE",
          // Stamp with the tenant so the gift certificate stays on
          // this gym instead of dropping to the default-client
          // fallback (which would let other tenants redeem it).
          clientId,
        },
      });
    }
  }

  // Handle gift certificate redemption -- scoped to this tenant so
  // one gym's code can't be redeemed at another gym.
  if (redeemedGiftCode && redeemedGiftAmountCents > 0) {
    const gc = await prisma.giftCertificate.findFirst({
      where: { code: redeemedGiftCode, clientId },
    });
    if (gc) {
      const newBalance = gc.balanceCents - redeemedGiftAmountCents;
      await prisma.giftCertificate.update({
        where: { id: gc.id },
        data: {
          balanceCents: Math.max(0, newBalance),
          status: newBalance <= 0 ? "REDEEMED" : "ACTIVE",
        },
      });
    }
  }
}

/**
 * Process portal store checkout from webhook metadata.
 *
 * Refuses to run without a tenant clientId in the event metadata.
 * Every downstream lookup (POSItem, MembershipPlan, Member) is
 * scoped to that tenant so a stray or spoofed cartItem id can't
 * touch another gym's inventory / plan / member.
 */
async function processPortalStoreCheckout(params: {
  externalPaymentId: string;
  processor: ProcessorType;
  metadata: Record<string, string>;
  amountTotalCents?: number;
  taxCents?: number;
}): Promise<void> {
  const { externalPaymentId, processor, metadata } = params;
  const processorLabel = processor.toUpperCase();
  const memberId = metadata.memberId || null;
  const clientId = metadata.clientId;
  if (!clientId) {
    console.error("processPortalStoreCheckout: missing clientId in metadata; refusing to process", { externalPaymentId });
    return;
  }
  const cartItems: Array<{
    itemId: string;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }> = JSON.parse(metadata.cartItems || "[]");

  if (cartItems.length === 0) return;

  const posCartItems = cartItems.filter((ci) => !ci.itemId.startsWith("plan_"));
  const planCartItems = cartItems.filter((ci) => ci.itemId.startsWith("plan_"));

  const posItemIds = posCartItems.map((ci) => ci.itemId);
  const posItems =
    posItemIds.length > 0
      ? await prisma.pOSItem.findMany({ where: { id: { in: posItemIds }, clientId } })
      : [];
  const posItemMap = new Map(posItems.map((i) => [i.id, i]));

  const planIds = planCartItems.map((ci) => ci.itemId.replace("plan_", ""));
  const plans =
    planIds.length > 0
      ? await prisma.membershipPlan.findMany({ where: { id: { in: planIds }, clientId } })
      : [];
  const planMap = new Map(plans.map((p) => [`plan_${p.id}`, p]));

  let memberName: string | null = null;
  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, clientId: true },
    });
    // Only trust the memberId when they belong to the same tenant
    // the checkout was created under. Prevents cross-tenant credit /
    // membership creation via a spoofed metadata payload.
    if (member && member.clientId === clientId) memberName = `${member.firstName} ${member.lastName}`;
  }

  const lineItemsData = posCartItems
    .filter((ci) => posItemMap.has(ci.itemId))
    .map((ci) => {
      const posItem = posItemMap.get(ci.itemId)!;
      const variantParts = [ci.selectedSize, ci.selectedColor].filter(Boolean);
      const variantInfo =
        variantParts.length > 0
          ? JSON.stringify({ size: ci.selectedSize || null, color: ci.selectedColor || null })
          : null;
      const displayName =
        variantParts.length > 0
          ? `${posItem.name} (${variantParts.join(" / ")})`
          : posItem.name;
      return {
        id: crypto.randomUUID(),
        itemId: posItem.id,
        itemName: displayName,
        itemSku: posItem.sku || null,
        type: "product",
        membershipPlanId: null as string | null,
        variantInfo,
        quantity: ci.quantity,
        unitPriceCents: posItem.priceCents,
        subtotalCents: posItem.priceCents * ci.quantity,
      };
    });

  const planLineItems = planCartItems
    .filter((ci) => planMap.has(ci.itemId))
    .map((ci) => {
      const plan = planMap.get(ci.itemId)!;
      return {
        id: crypto.randomUUID(),
        itemId: null as string | null,
        itemName: plan.name,
        itemSku: null as string | null,
        type: "membership",
        membershipPlanId: plan.id,
        variantInfo: null as string | null,
        quantity: ci.quantity,
        unitPriceCents: plan.priceCents ?? 0,
        subtotalCents: (plan.priceCents ?? 0) * ci.quantity,
      };
    });

  const allLineItems = [...lineItemsData, ...planLineItems];
  const subtotalCents = allLineItems.reduce((sum, li) => sum + li.subtotalCents, 0);
  const taxCents = params.taxCents || 0;
  const totalCents = params.amountTotalCents || subtotalCents + taxCents;

  const transactionNumber = `TXN-${Date.now()}`;
  await prisma.pOSTransaction.create({
    data: {
      id: crypto.randomUUID(),
      transactionNumber,
      memberId,
      memberName,
      subtotalCents,
      taxCents,
      discountCents: 0,
      totalCents,
      paymentMethod: processorLabel,
      status: "COMPLETED",
      paymentIntentId: externalPaymentId,
      paymentProcessor: processor,
      clientId,
      updatedAt: new Date(),
      POSLineItem: {
        create: allLineItems.map((li) => ({
          id: li.id,
          itemId: li.itemId,
          itemName: li.itemName,
          itemSku: li.itemSku,
          type: li.type,
          membershipPlanId: li.membershipPlanId,
          variantInfo: li.variantInfo,
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          subtotalCents: li.subtotalCents,
        })),
      },
    },
  });

  // Decrement inventory for POS items
  for (const ci of posCartItems) {
    if (!posItemMap.has(ci.itemId)) continue;
    if (ci.selectedSize || ci.selectedColor) {
      const variant = await prisma.pOSItemVariant.findFirst({
        where: {
          itemId: ci.itemId,
          size: ci.selectedSize || null,
          color: ci.selectedColor || null,
        },
      });
      if (variant) {
        await prisma.pOSItemVariant.update({
          where: { id: variant.id },
          data: { quantity: { decrement: ci.quantity } },
        });
      }
    }
    await prisma.pOSItem.update({
      where: { id: ci.itemId },
      data: {
        quantity: { decrement: ci.quantity },
        updatedAt: new Date(),
      },
    });
  }

  // Create memberships for purchased plans
  if (memberId && planCartItems.length > 0) {
    for (const ci of planCartItems) {
      const plan = planMap.get(ci.itemId);
      if (!plan) continue;
      const startDate = new Date();
      const contractEndDate = plan.contractLengthMonths
        ? calculateContractEndDate(startDate, plan.contractLengthMonths)
        : null;
      const signupExtras = buildMembershipSignupExtras(plan, startDate, contractEndDate);
      await prisma.membership.create({
        data: {
          memberId,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startDate,
          contractEndDate,
          ...(signupExtras.remainingClassCredits !== undefined && {
            remainingClassCredits: signupExtras.remainingClassCredits,
          }),
          ...(signupExtras.creditsExpireAt !== undefined && {
            creditsExpireAt: signupExtras.creditsExpireAt,
          }),
        },
      });
    }
  }
}

/**
 * Handle off-session payment success (auto-billing / dunning).
 */
export async function handlePaymentSucceeded(params: {
  externalPaymentId: string;
  processor: ProcessorType;
  invoiceId?: string;
}): Promise<void> {
  if (!params.invoiceId) return;

  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { id: params.invoiceId },
        { invoiceNumber: params.invoiceId },
      ],
    },
  });

  if (invoice && invoice.status !== "PAID") {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: params.processor.toUpperCase(),
        externalPaymentId: params.externalPaymentId,
        paymentProcessor: params.processor,
        ...(params.processor === "stripe"
          ? { stripePaymentIntentId: params.externalPaymentId }
          : {}),
      },
    });
  }
}

/**
 * Handle payment failure (auto-billing / dunning).
 */
export async function handlePaymentFailed(params: {
  invoiceId?: string;
}): Promise<void> {
  if (!params.invoiceId) return;

  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { id: params.invoiceId },
        { invoiceNumber: params.invoiceId },
      ],
    },
  });

  if (invoice && invoice.status !== "PAID") {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAST_DUE" },
    });
  }
}

/**
 * Handle refund completed from external dashboard.
 */
export async function handleRefundCompleted(params: {
  externalPaymentId: string;
  isFullRefund?: boolean;
}): Promise<void> {
  // Update POS transaction
  const txn = await prisma.pOSTransaction.findFirst({
    where: { paymentIntentId: params.externalPaymentId },
  });
  if (txn && txn.status !== "REFUNDED") {
    await prisma.pOSTransaction.update({
      where: { id: txn.id },
      data: {
        status: params.isFullRefund !== false ? "REFUNDED" : "COMPLETED",
        updatedAt: new Date(),
      },
    });
  }

  // Update invoice if linked
  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { stripePaymentIntentId: params.externalPaymentId },
        { externalPaymentId: params.externalPaymentId },
      ],
    },
  });
  if (invoice) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "REFUNDED" },
    });
  }
}

// ---------------------------------------------------------------------------
// Currency helper
// ---------------------------------------------------------------------------

export async function getCurrency(clientId: string): Promise<string> {
  const row = await prisma.settings.findUnique({
    where: { key_clientId: { key: "currency", clientId } },
  });
  return (row?.value || "USD").toLowerCase();
}
