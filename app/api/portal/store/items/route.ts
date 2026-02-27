import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch active POS items marked for online sale (with variant stock)
  const posItems = await prisma.pOSItem.findMany({
    where: { isActive: true, availableOnline: true },
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      quantity: true,
      category: true,
      sizes: true,
      colors: true,
      variantLabel1: true,
      variantLabel2: true,
      itemType: true,
      variants: {
        select: { size: true, color: true, quantity: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch membership plans marked as available for online purchase
  const plans = await prisma.membershipPlan.findMany({
    where: { isActive: true, availableOnline: true },
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      setupFeeCents: true,
      billingCycle: true,
      contractLengthMonths: true,
      autoRenew: true,
      trialDays: true,
      cancellationNoticeDays: true,
      cancellationFeeCents: true,
      classesPerDay: true,
      classesPerWeek: true,
      classesPerMonth: true,
      allowedStyles: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  // Combine into a single store items list
  const items = [
    ...posItems.map((item) => ({
      id: item.id,
      type: "product" as const,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      quantity: item.variants.length > 0
        ? item.variants.reduce((sum, v) => sum + v.quantity, 0)
        : item.quantity,
      category: item.category,
      sizes: item.sizes,
      colors: item.colors,
      variantLabel1: item.variantLabel1,
      variantLabel2: item.variantLabel2,
      itemType: item.itemType,
      variants: item.variants.map((v) => ({
        size: v.size,
        color: v.color,
        quantity: v.quantity,
      })),
      billingCycle: null as string | null,
      contractDetails: null as null,
    })),
    ...plans.map((plan) => ({
      id: `plan_${plan.id}`,
      type: "membership" as const,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents ?? 0,
      quantity: 999,
      category: "Membership Plans",
      billingCycle: plan.billingCycle,
      contractDetails: {
        setupFeeCents: plan.setupFeeCents,
        contractLengthMonths: plan.contractLengthMonths,
        autoRenew: plan.autoRenew,
        trialDays: plan.trialDays,
        cancellationNoticeDays: plan.cancellationNoticeDays,
        cancellationFeeCents: plan.cancellationFeeCents,
        classesPerDay: plan.classesPerDay,
        classesPerWeek: plan.classesPerWeek,
        classesPerMonth: plan.classesPerMonth,
        allowedStyles: plan.allowedStyles,
      },
    })),
  ];

  return NextResponse.json({ items });
}
