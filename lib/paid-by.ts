import { prisma } from "@/lib/prisma";

/**
 * Who a sale is "for" vs who paid. When a card charge went to someone
 * else's card (PAYS_FOR payer), the sale stays on the member it's for, but
 * it's labeled "Kid via Parent" everywhere it's listed and the payment
 * shows on the payer's activity (POSTransaction.paidByMemberId).
 *
 * Returns { memberName, paidByMemberId } ready to spread into a
 * POSTransaction create. paidByMemberId is null when the member paid
 * for themselves (or the payer can't be verified in this tenant).
 */
export async function resolvePaidBy(opts: {
  memberId: string;
  billedMemberId?: string | null;
  clientId: string;
  memberName?: string | null; // fallback display name for the member
}): Promise<{ memberName: string | null; paidByMemberId: string | null }> {
  const { memberId, billedMemberId, clientId } = opts;
  const ids = [memberId, ...(billedMemberId && billedMemberId !== memberId ? [billedMemberId] : [])];
  const rows = await prisma.member.findMany({
    where: { id: { in: ids }, clientId },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = (id: string) => {
    const r = rows.find((x) => x.id === id);
    return r ? `${r.firstName} ${r.lastName}`.trim() : null;
  };
  const memberName = nameOf(memberId) || opts.memberName || null;
  if (!billedMemberId || billedMemberId === memberId) {
    return { memberName, paidByMemberId: null };
  }
  const payerName = nameOf(billedMemberId);
  if (!payerName) return { memberName, paidByMemberId: null };
  return {
    memberName: `${memberName || "Member"} via ${payerName}`,
    paidByMemberId: billedMemberId,
  };
}
