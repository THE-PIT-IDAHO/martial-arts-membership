import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPaymentReceivedEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";

// GET /api/invoices/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membership: {
          select: {
            id: true,
            membershipPlan: { select: { name: true, billingCycle: true, priceCents: true } },
          },
        },
      },
    });

    if (!invoice || invoice.clientId !== clientId) {
      return new NextResponse("Invoice not found", { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return new NextResponse("Failed to fetch invoice", { status: 500 });
  }
}

// PATCH /api/invoices/:id — status transitions (PAID, VOID, FAILED)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { status, paymentMethod, notes } = body;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        membership: {
          select: { id: true, memberId: true, membershipPlan: { select: { name: true } } },
        },
        member: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice || invoice.clientId !== clientId) {
      return new NextResponse("Invoice not found", { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (notes !== undefined) data.notes = notes || null;

    if (status === "PAID") {
      data.status = "PAID";
      data.paidAt = new Date();
      data.paymentMethod = paymentMethod || "CASH";

      // Create a POSTransaction to record the payment
      const txnId = crypto.randomUUID();
      const txn = await prisma.pOSTransaction.create({
        data: {
          id: txnId,
          transactionNumber: `TXN-${Date.now()}`,
          memberId: invoice.membership.memberId,
          memberName: `${invoice.member.firstName} ${invoice.member.lastName}`,
          subtotalCents: invoice.amountCents,
          taxCents: 0,
          discountCents: 0,
          totalCents: invoice.amountCents,
          paymentMethod: paymentMethod || "CASH",
          status: "COMPLETED",
          notes: `Invoice ${invoice.invoiceNumber || id} — ${invoice.membership.membershipPlan.name}`,
          clientId,
          updatedAt: new Date(),
          POSLineItem: {
            create: {
              id: crypto.randomUUID(),
              itemName: invoice.membership.membershipPlan.name,
              type: "membership",
              quantity: 1,
              unitPriceCents: invoice.amountCents,
              subtotalCents: invoice.amountCents,
            },
          },
        },
      });

      data.transactionId = txn.id;

      // Update membership lastPaymentDate
      await prisma.membership.update({
        where: { id: invoice.membershipId },
        data: { lastPaymentDate: new Date() },
      });

      // Send payment received email (fire and forget)
      sendPaymentReceivedEmail({
        memberId: invoice.membership.memberId,
        memberName: `${invoice.member.firstName} ${invoice.member.lastName}`,
        amountCents: invoice.amountCents,
        invoiceNumber: invoice.invoiceNumber || undefined,
        planName: invoice.membership.membershipPlan.name,
      }).catch(() => {});
    } else if (status === "VOID") {
      data.status = "VOID";
    } else if (status === "FAILED") {
      data.status = "FAILED";
    } else if (status === "PAST_DUE") {
      data.status = "PAST_DUE";
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data,
    });

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error("Error updating invoice:", error);
    return new NextResponse("Failed to update invoice", { status: 500 });
  }
}
