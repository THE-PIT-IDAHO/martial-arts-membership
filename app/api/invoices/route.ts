import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/billing";
import { getClientId } from "@/lib/tenant";

// GET /api/invoices?memberId=&status=&from=&to=
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const url = new URL(req.url);
    const memberId = url.searchParams.get("memberId");
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const where: Record<string, unknown> = { clientId };
    if (memberId) where.memberId = memberId;
    if (status) where.status = status;
    if (from || to) {
      const dueDateFilter: Record<string, Date> = {};
      if (from) dueDateFilter.gte = new Date(from);
      if (to) dueDateFilter.lte = new Date(to);
      where.dueDate = dueDateFilter;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        amountCents: true,
        status: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        dueDate: true,
        paidAt: true,
        paymentMethod: true,
        transactionId: true,
        notes: true,
        createdAt: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membership: {
          select: {
            id: true,
            membershipPlan: { select: { name: true, billingCycle: true } },
          },
        },
      },
      orderBy: { dueDate: "desc" },
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return new NextResponse("Failed to fetch invoices", { status: 500 });
  }
}

// POST /api/invoices — manual invoice creation
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { membershipId, memberId, amountCents, billingPeriodStart, billingPeriodEnd, dueDate, notes } = body;

    if (!membershipId || !memberId || !amountCents) {
      return new NextResponse("membershipId, memberId, and amountCents are required", { status: 400 });
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(),
        membershipId,
        memberId,
        amountCents,
        billingPeriodStart: new Date(billingPeriodStart),
        billingPeriodEnd: new Date(billingPeriodEnd),
        dueDate: new Date(dueDate || billingPeriodStart),
        notes: notes || null,
        clientId,
      },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return new NextResponse("Failed to create invoice", { status: 500 });
  }
}
