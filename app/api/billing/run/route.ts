import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calculateNextPaymentDate,
  calculateBillingPeriodEnd,
  getEffectivePriceCents,
  generateInvoiceNumber,
} from "@/lib/billing";
import { sendInvoiceCreatedEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";
import { getGymTimezone, localMidnightUtc, formatDateInTimezone } from "@/lib/dates";

// POST /api/billing/run
// Scans active memberships where nextPaymentDate <= today and autoRenew = true.
// Creates PENDING invoices and advances nextPaymentDate.
// Idempotent: @@unique([membershipId, billingPeriodStart]) prevents duplicates.
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    // End-of-today in the gym's TZ so billing rolls over at the gym's
    // local midnight, not the server's UTC midnight.
    const tz = await getGymTimezone(clientId);
    const todayYmd = formatDateInTimezone(new Date(), tz);
    const today = new Date(localMidnightUtc(todayYmd, tz) + 24 * 60 * 60 * 1000 - 1);

    // Read grace period from settings
    const graceSetting = await prisma.settings.findFirst({
      where: { key: "billing_grace_period_days", clientId },
    });
    const gracePeriodDays = graceSetting ? parseInt(graceSetting.value) || 7 : 7;

    // Find memberships due for billing
    const dueMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        nextPaymentDate: { lte: today },
        membershipPlan: { autoRenew: true },
        member: { clientId },
      },
      include: {
        membershipPlan: {
          select: { priceCents: true, billingCycle: true, name: true },
        },
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ms of dueMemberships) {
      try {
        if (!ms.nextPaymentDate) {
          skipped++;
          continue;
        }

        const billingPeriodStart = new Date(ms.nextPaymentDate);
        const billingPeriodEnd = calculateBillingPeriodEnd(
          billingPeriodStart,
          ms.membershipPlan.billingCycle
        );

        const dueDate = new Date(billingPeriodStart);
        dueDate.setDate(dueDate.getDate() + gracePeriodDays);

        const amountCents = getEffectivePriceCents(
          ms,
          ms.membershipPlan,
          billingPeriodStart
        );

        // Try to create invoice — unique constraint prevents duplicates.
        // $0 invoices (coach comps etc.) come out PAID so the past-due
        // sweep doesn't later email the member chasing nothing.
        try {
          const invoiceNumber = generateInvoiceNumber();
          const isZeroDollar = amountCents === 0;
          await prisma.invoice.create({
            data: {
              invoiceNumber,
              membershipId: ms.id,
              memberId: ms.member.id,
              amountCents,
              billingPeriodStart,
              billingPeriodEnd,
              dueDate,
              clientId,
              ...(isZeroDollar
                ? {
                    status: "PAID",
                    paidAt: new Date(),
                    paymentMethod: "COMPLIMENTARY",
                  }
                : {}),
            },
          });
          created++;

          // Send invoice created email (fire and forget)
          sendInvoiceCreatedEmail({
            memberId: ms.member.id,
            memberName: `${ms.member.firstName} ${ms.member.lastName}`,
            invoiceNumber,
            amountCents,
            dueDate,
            planName: ms.membershipPlan.name,
          }).catch(() => {});
        } catch (e: unknown) {
          // Unique constraint violation = already created for this period
          if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
            skipped++;
            continue;
          }
          throw e;
        }

        // Advance nextPaymentDate
        const nextPayment = calculateNextPaymentDate(
          billingPeriodStart,
          ms.membershipPlan.billingCycle
        );
        await prisma.membership.update({
          where: { id: ms.id },
          data: { nextPaymentDate: nextPayment },
        });
      } catch (err) {
        const memberName = `${ms.member.firstName} ${ms.member.lastName}`;
        errors.push(`${memberName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      created,
      skipped,
      total: dueMemberships.length,
      errors,
    });
  } catch (error) {
    console.error("Error running billing:", error);
    return new NextResponse("Failed to run billing", { status: 500 });
  }
}
