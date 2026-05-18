import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/payments
// Unified payment history for the authenticated member:
//  - membership Invoices (recurring billing)
//  - POSTransactions (counter sales, memberships sold at signup, etc.)
//
// Returned shape is normalized so the portal can render both without
// branching on type, but the `type` field lets the UI label them.
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [invoices, posTx] = await Promise.all([
    prisma.invoice.findMany({
      where: { memberId: auth.memberId },
      include: { membership: { select: { membershipPlan: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.pOSTransaction.findMany({
      where: { memberId: auth.memberId },
      include: { POSLineItem: { select: { itemName: true, quantity: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const items: Array<{
    id: string;
    type: "invoice" | "pos";
    date: string;
    amountCents: number;
    status: string;
    label: string;
    sublabel?: string;
    invoiceNumber?: string;
    paidAt?: string | null;
    dueDate?: string;
    paymentMethod?: string;
  }> = [];

  for (const inv of invoices) {
    items.push({
      id: `inv-${inv.id}`,
      type: "invoice",
      date: inv.createdAt.toISOString(),
      amountCents: inv.amountCents,
      status: inv.status,
      label: inv.membership?.membershipPlan?.name || "Membership",
      invoiceNumber: inv.invoiceNumber || undefined,
      paidAt: inv.paidAt?.toISOString() || null,
      dueDate: inv.dueDate.toISOString(),
      paymentMethod: inv.paymentMethod || undefined,
    });
  }

  for (const tx of posTx) {
    const lineSummary = tx.POSLineItem
      .map((li) => (li.quantity > 1 ? `${li.itemName} ×${li.quantity}` : li.itemName))
      .join(", ");
    items.push({
      id: `pos-${tx.id}`,
      type: "pos",
      date: tx.createdAt.toISOString(),
      amountCents: tx.totalCents,
      status: tx.status,
      label: lineSummary || "Counter sale",
      invoiceNumber: tx.transactionNumber || undefined,
      paymentMethod: tx.paymentMethod,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
}
