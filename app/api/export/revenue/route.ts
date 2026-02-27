import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatInTimezone, getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // --- Invoices ---
  const invoiceWhere: Record<string, unknown> = {};
  if (from || to) {
    invoiceWhere.createdAt = {};
    if (from) (invoiceWhere.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (invoiceWhere.createdAt as Record<string, unknown>).lte = new Date(to + "T23:59:59");
  }

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { firstName: true, lastName: true } },
      membership: { include: { membershipPlan: { select: { name: true } } } },
    },
  });

  // --- POS Transactions ---
  const posWhere: Record<string, unknown> = {};
  if (from || to) {
    posWhere.createdAt = {};
    if (from) (posWhere.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (posWhere.createdAt as Record<string, unknown>).lte = new Date(to + "T23:59:59");
  }

  const transactions = await prisma.pOSTransaction.findMany({
    where: posWhere,
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Date",
    "Type",
    "Reference",
    "Member",
    "Description",
    "Amount",
    "Status",
    "Payment Method",
  ];

  const tz = (await getSetting("timezone")) || "America/Denver";
  const dateFmt: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

  const invoiceRows = invoices.map((inv) => [
    formatInTimezone(new Date(inv.createdAt), tz, dateFmt),
    "Invoice",
    inv.invoiceNumber || inv.id,
    inv.member ? `${inv.member.firstName} ${inv.member.lastName}` : "",
    inv.membership?.membershipPlan?.name || "Membership",
    (inv.amountCents / 100).toFixed(2),
    inv.status,
    inv.paymentMethod || "",
  ]);

  const posRows = transactions.map((t) => [
    formatInTimezone(new Date(t.createdAt), tz, dateFmt),
    "POS",
    t.transactionNumber || t.id,
    t.memberName || "",
    "Point of Sale",
    (t.totalCents / 100).toFixed(2),
    t.status,
    t.paymentMethod,
  ]);

  const allRows = [...invoiceRows, ...posRows].sort(
    (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );

  const today = getTodayInTimezone(tz);
  return csvResponse(toCsv(headers, allRows), `revenue-${today}.csv`);
}
