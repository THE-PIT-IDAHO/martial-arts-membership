import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPastDueAlertEmail } from "@/lib/notifications";

// POST /api/billing/past-due
// Marks PENDING invoices whose dueDate has passed as PAST_DUE.
export async function POST() {
  try {
    const now = new Date();

    // Find individual invoices so we can send per-member notifications
    const pastDueInvoices = await prisma.invoice.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
      },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    let updated = 0;
    for (const invoice of pastDueInvoices) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAST_DUE" },
      });
      updated++;

      // Send past due alert email (fire and forget)
      sendPastDueAlertEmail({
        memberId: invoice.member.id,
        memberName: `${invoice.member.firstName} ${invoice.member.lastName}`,
        amountCents: invoice.amountCents,
        invoiceNumber: invoice.invoiceNumber || undefined,
        dueDate: invoice.dueDate,
      }).catch(() => {});
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Error updating past-due invoices:", error);
    return new NextResponse("Failed to update past-due invoices", { status: 500 });
  }
}
