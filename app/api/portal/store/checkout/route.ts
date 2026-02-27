import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import {
  getActiveProcessor,
  createCheckoutSession,
  getCurrency,
  ensureProcessorCustomer,
} from "@/lib/payment";

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const processor = await getActiveProcessor();
  if (!processor) {
    return NextResponse.json({ error: "No payment processor configured" }, { status: 400 });
  }

  const { items } = await req.json();

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      clientId: true,
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Separate POS items from membership plan items
  const posItemIds: string[] = [];
  const planItemIds: string[] = [];
  for (const cartItem of items) {
    if (cartItem.itemId.startsWith("plan_")) {
      planItemIds.push(cartItem.itemId.replace("plan_", ""));
    } else {
      posItemIds.push(cartItem.itemId);
    }
  }

  // Fetch POS items with variants
  const posItems = posItemIds.length > 0
    ? await prisma.pOSItem.findMany({
        where: { id: { in: posItemIds }, isActive: true },
        include: { variants: true },
      })
    : [];
  const posItemMap = new Map(posItems.map((i) => [i.id, i]));

  // Fetch membership plans
  const plans = planItemIds.length > 0
    ? await prisma.membershipPlan.findMany({
        where: { id: { in: planItemIds }, isActive: true },
      })
    : [];
  const planMap = new Map(plans.map((p) => [`plan_${p.id}`, p]));

  const currency = await getCurrency();

  // Validate stock and calculate total
  let totalCents = 0;
  const checkoutLineItems: Array<{
    name: string;
    description?: string;
    amountCents: number;
    quantity: number;
  }> = [];

  for (const cartItem of items) {
    if (cartItem.itemId.startsWith("plan_")) {
      const plan = planMap.get(cartItem.itemId);
      if (!plan) {
        return NextResponse.json({ error: "Membership plan not found" }, { status: 400 });
      }
      const unitAmount = plan.priceCents ?? 0;
      checkoutLineItems.push({
        name: plan.name,
        ...(plan.description ? { description: plan.description } : {}),
        amountCents: unitAmount,
        quantity: cartItem.quantity,
      });
      totalCents += unitAmount * cartItem.quantity;
    } else {
      const posItem = posItemMap.get(cartItem.itemId);
      if (!posItem) {
        return NextResponse.json({ error: `Item not found: ${cartItem.itemId}` }, { status: 400 });
      }
      // Check stock
      if (posItem.variants.length > 0) {
        const variant = posItem.variants.find(
          (v) =>
            (v.size || null) === (cartItem.selectedSize || null) &&
            (v.color || null) === (cartItem.selectedColor || null)
        );
        const availableStock = variant ? variant.quantity : 0;
        if (availableStock < cartItem.quantity) {
          const varLabel = [cartItem.selectedSize, cartItem.selectedColor].filter(Boolean).join(" / ");
          return NextResponse.json(
            { error: `Insufficient stock for "${posItem.name}${varLabel ? ` (${varLabel})` : ""}". Available: ${availableStock}` },
            { status: 400 }
          );
        }
      } else if (posItem.quantity > 0 && posItem.quantity < cartItem.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for "${posItem.name}". Available: ${posItem.quantity}` },
          { status: 400 }
        );
      }

      const variantParts = [cartItem.selectedSize, cartItem.selectedColor].filter(Boolean);
      const displayName = variantParts.length > 0
        ? `${posItem.name} (${variantParts.join(" / ")})`
        : posItem.name;

      checkoutLineItems.push({
        name: displayName,
        ...(posItem.description ? { description: posItem.description } : {}),
        amountCents: posItem.priceCents,
        quantity: cartItem.quantity,
      });
      totalCents += posItem.priceCents * cartItem.quantity;
    }
  }

  // Ensure processor customer exists
  await ensureProcessorCustomer({
    memberId: member.id,
    email: member.email || undefined,
    name: `${member.firstName} ${member.lastName}`,
  });

  // Check for tax rate
  const taxSetting = await prisma.settings.findFirst({ where: { key: "taxRate" } });
  const taxRatePercent = taxSetting ? Number(taxSetting.value) : 0;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const session = await createCheckoutSession({
    amountCents: totalCents,
    currency,
    description: "Store Purchase",
    successUrl: `${baseUrl}/portal/store/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/portal/store`,
    memberId: member.id,
    memberEmail: member.email || undefined,
    lineItems: checkoutLineItems,
    taxRatePercent: taxRatePercent > 0 ? taxRatePercent : undefined,
    metadata: {
      memberId: member.id,
      clientId: member.clientId,
      cartItems: JSON.stringify(items),
    },
  });

  return NextResponse.json({ url: session.url });
}
