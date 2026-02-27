import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/dashboard
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...

    // --- Members ---
    const totalMembers = await prisma.member.count({ where: { clientId } });
    const activeMembers = await prisma.member.count({
      where: { status: "ACTIVE", clientId },
    });
    const prospectMembers = await prisma.member.count({
      where: { status: "PROSPECT", clientId },
    });

    // Recently added members (last 7 days)
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentMembers = await prisma.member.findMany({
      where: { createdAt: { gte: weekAgo }, clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // --- Today's Classes ---
    // Get all class sessions and filter for ones that occur today
    const allClasses = await prisma.classSession.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        classType: true,
        classTypes: true,
        styleName: true,
        styleNames: true,
        isRecurring: true,
        frequencyNumber: true,
        frequencyUnit: true,
        scheduleStartDate: true,
        scheduleEndDate: true,
        isOngoing: true,
        excludedDates: true,
        color: true,
        coachName: true,
        _count: {
          select: {
            attendances: {
              where: {
                attendanceDate: {
                  gte: todayStart,
                  lte: todayEnd,
                },
              },
            },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    // Filter classes that happen today (matching calendar page logic)
    const todaysClasses = allClasses.filter((cls) => {
      const classStart = new Date(cls.startsAt);

      // Non-recurring: check if the exact date matches today
      if (!cls.isRecurring) {
        return (
          classStart >= todayStart && classStart <= todayEnd
        );
      }

      // Recurring: check if today falls within the schedule
      const scheduleStart = cls.scheduleStartDate
        ? new Date(cls.scheduleStartDate)
        : null;
      const scheduleEnd = cls.scheduleEndDate
        ? new Date(cls.scheduleEndDate)
        : null;

      if (scheduleStart && todayStart < scheduleStart) return false;
      if (scheduleEnd && !cls.isOngoing && todayStart > scheduleEnd) return false;

      // Check excluded dates
      if (cls.excludedDates) {
        try {
          const excluded: string[] = JSON.parse(cls.excludedDates);
          const todayStr = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, "0")}-${String(todayStart.getDate()).padStart(2, "0")}`;
          if (excluded.includes(todayStr)) return false;
        } catch { /* ignore */ }
      }

      // Day of week must match
      const classDow = classStart.getDay();
      if (classDow !== dayOfWeek) return false;

      const freq = cls.frequencyNumber || 1;

      // Weekly recurring: check interval
      if (cls.frequencyUnit === "Week") {
        if (freq === 1) return true;
        // Check if the right number of weeks have elapsed
        const refDate = scheduleStart || classStart;
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksDiff = Math.floor((todayStart.getTime() - refDate.getTime()) / msPerWeek);
        return weeksDiff % freq === 0;
      }

      // Daily recurring
      if (cls.frequencyUnit === "Day") {
        if (freq === 1) return true;
        const refDate = scheduleStart || classStart;
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.floor((todayStart.getTime() - refDate.getTime()) / msPerDay);
        return daysDiff % freq === 0;
      }

      return false;
    });

    // Get today's attendance records per class for interactive features
    const todayAttendances = await prisma.attendance.findMany({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        classSessionId: { in: todaysClasses.map((c) => c.id) },
      },
      select: {
        id: true,
        memberId: true,
        classSessionId: true,
        confirmed: true,
        checkedInAt: true,
        source: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { checkedInAt: "asc" },
    });

    // Group attendance by class
    const attendanceByClass: Record<string, typeof todayAttendances> = {};
    for (const att of todayAttendances) {
      if (att.classSessionId) {
        if (!attendanceByClass[att.classSessionId]) {
          attendanceByClass[att.classSessionId] = [];
        }
        attendanceByClass[att.classSessionId].push(att);
      }
    }

    // Format for response
    const classesToday = todaysClasses.map((cls) => ({
      id: cls.id,
      name: cls.name,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      styleName: cls.styleName || cls.styleNames,
      classType: cls.classType || cls.classTypes,
      color: cls.color,
      coachName: cls.coachName,
      attendanceCount: cls._count.attendances,
      attendees: (attendanceByClass[cls.id] || []).map((a) => ({
        id: a.id,
        memberId: a.memberId,
        firstName: a.member.firstName,
        lastName: a.member.lastName,
        confirmed: a.confirmed,
        checkedInAt: a.checkedInAt,
        source: a.source,
      })),
    }));

    // Sort by time of day (not full datetime, since recurring classes have old dates)
    classesToday.sort((a, b) => {
      const aDate = new Date(a.startsAt);
      const bDate = new Date(b.startsAt);
      const aMins = aDate.getHours() * 60 + aDate.getMinutes();
      const bMins = bDate.getHours() * 60 + bDate.getMinutes();
      return aMins - bMins;
    });

    // --- Today's Attendance ---
    const todayAttendanceCount = await prisma.attendance.count({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        member: { clientId },
      },
    });

    const recentCheckins = await prisma.attendance.findMany({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        member: { clientId },
      },
      select: {
        id: true,
        checkedInAt: true,
        confirmed: true,
        source: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classSession: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { checkedInAt: "desc" },
      take: 10,
    });

    // --- Tasks ---
    const openTasks = await prisma.task.findMany({
      where: { status: "OPEN", clientId },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        recurrence: true,
        assignedRole: true,
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 8,
    });

    const overdueTasks = openTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < todayStart
    ).length;

    // --- Today's Appointments ---
    const todaysAppointments = await prisma.scheduledAppointment.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        status: { not: "CANCELLED" },
        clientId,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        memberName: true,
        coachName: true,
        status: true,
        appointment: {
          select: {
            title: true,
            color: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // --- Revenue ---
    // Today's POS revenue
    const todayTransactions = await prisma.pOSTransaction.findMany({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: "COMPLETED",
        clientId,
      },
      select: {
        totalCents: true,
        paymentMethod: true,
      },
    });
    const todayPosRevenue = todayTransactions.reduce((sum, t) => sum + t.totalCents, 0);

    // This month's POS revenue
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTransactions = await prisma.pOSTransaction.aggregate({
      where: {
        createdAt: { gte: monthStart, lte: todayEnd },
        status: "COMPLETED",
        clientId,
      },
      _sum: { totalCents: true },
      _count: true,
    });

    // Active memberships with recurring revenue
    const activeMemberships = await prisma.membership.findMany({
      where: { status: "ACTIVE", member: { clientId } },
      select: {
        customPriceCents: true,
        membershipPlan: {
          select: {
            priceCents: true,
            billingCycle: true,
          },
        },
      },
    });

    // Calculate monthly recurring revenue (MRR)
    let monthlyRecurringRevenue = 0;
    for (const ms of activeMemberships) {
      const price = ms.customPriceCents ?? ms.membershipPlan.priceCents ?? 0;
      switch (ms.membershipPlan.billingCycle) {
        case "WEEKLY": monthlyRecurringRevenue += price * 4; break;
        case "MONTHLY": monthlyRecurringRevenue += price; break;
        case "QUARTERLY": monthlyRecurringRevenue += Math.round(price / 3); break;
        case "SEMI_ANNUALLY": monthlyRecurringRevenue += Math.round(price / 6); break;
        case "YEARLY": monthlyRecurringRevenue += Math.round(price / 12); break;
        default: monthlyRecurringRevenue += price; break;
      }
    }

    // --- Expired non-recurring memberships ---
    // Only show memberships whose plan does NOT auto-renew and whose end date has passed
    const expiringMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        endDate: { lt: todayStart },
        membershipPlan: { autoRenew: false },
        member: { clientId },
      },
      select: {
        id: true,
        endDate: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        membershipPlan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { endDate: "asc" },
      take: 5,
    });

    // --- Billing ---
    const pastDueCount = await prisma.invoice.count({
      where: { status: "PAST_DUE", member: { clientId } },
    });

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const upcomingBillings = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        nextPaymentDate: {
          gte: todayStart,
          lte: sevenDaysFromNow,
        },
        member: { clientId },
      },
      select: {
        id: true,
        nextPaymentDate: true,
        customPriceCents: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membershipPlan: {
          select: { name: true, priceCents: true, billingCycle: true },
        },
      },
      orderBy: { nextPaymentDate: "asc" },
      take: 10,
    });

    const pastDueInvoices = await prisma.invoice.findMany({
      where: { status: "PAST_DUE", member: { clientId } },
      select: {
        id: true,
        amountCents: true,
        dueDate: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membership: {
          select: {
            membershipPlan: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    // --- Promotion Eligibility ---
    const eligibleForPromotion: {
      memberId: string;
      memberName: string;
      styleName: string;
      currentRank: string;
      nextRank: string;
      requirementsMet: { label: string; count: number; required: number }[];
    }[] = [];

    try {
      // Get all styles with belt systems
      const stylesWithBelts = await prisma.style.findMany({
        where: { beltSystemEnabled: true },
        select: {
          id: true,
          name: true,
          beltConfig: true,
          ranks: {
            select: { name: true, order: true, classRequirement: true },
            orderBy: { order: "asc" },
          },
        },
      });

      if (stylesWithBelts.length > 0) {
        // Get active members with styles and attendance
        const membersWithStyles = await prisma.member.findMany({
          where: {
            status: "ACTIVE",
            stylesNotes: { not: null },
            clientId,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stylesNotes: true,
            attendances: {
              select: {
                attendanceDate: true,
                checkedInAt: true,
                source: true,
                classSession: {
                  select: {
                    classType: true,
                    classTypes: true,
                    styleName: true,
                    styleNames: true,
                  },
                },
              },
            },
          },
        });

        for (const member of membersWithStyles) {
          if (!member.stylesNotes) continue;
          let memberStyles: any[];
          try {
            memberStyles = JSON.parse(member.stylesNotes);
          } catch {
            continue;
          }

          for (const ms of memberStyles) {
            if (ms.active === false) continue;
            const styleConfig = stylesWithBelts.find(
              (st) => st.name.toLowerCase() === (ms.name || "").toLowerCase()
            );
            if (!styleConfig || styleConfig.ranks.length === 0) continue;

            const sortedRanks = styleConfig.ranks; // already sorted by order asc
            const currentIdx = sortedRanks.findIndex((r) => r.name === ms.rank);
            if (currentIdx < 0 || currentIdx >= sortedRanks.length - 1) continue;

            const nextRank = sortedRanks[currentIdx + 1];

            // Filter attendance for this style (after reset date if set)
            const styleAttendances = member.attendances.filter((att) => {
              if (ms.attendanceResetDate) {
                const attDate = att.attendanceDate
                  ? new Date(att.attendanceDate).toISOString().split("T")[0]
                  : att.checkedInAt
                    ? new Date(att.checkedInAt).toISOString().split("T")[0]
                    : null;
                if (attDate && attDate < ms.attendanceResetDate) return false;
              }
              if (att.source === "IMPORTED") return true;
              if (!att.classSession) return false;
              if (att.classSession.styleNames) {
                try {
                  const names: string[] = JSON.parse(att.classSession.styleNames);
                  return names.some((n) => n.toLowerCase() === ms.name.toLowerCase());
                } catch { /* ignore */ }
              }
              return att.classSession.styleName?.toLowerCase() === ms.name.toLowerCase();
            });

            // Get class requirements
            let classRequirements: { label: string; count: number; required: number }[] = [];

            if (styleConfig.beltConfig) {
              try {
                const bc = typeof styleConfig.beltConfig === "string"
                  ? JSON.parse(styleConfig.beltConfig)
                  : styleConfig.beltConfig;
                if (bc.ranks && Array.isArray(bc.ranks)) {
                  const nextBeltRank = bc.ranks.find((r: any) => r.name === nextRank.name);
                  if (nextBeltRank?.classRequirements && Array.isArray(nextBeltRank.classRequirements)) {
                    classRequirements = nextBeltRank.classRequirements
                      .filter((req: any) => req.label && req.minCount > 0)
                      .map((req: any) => {
                        const count = styleAttendances.filter(
                          (a) => a.classSession?.classType?.toLowerCase() === req.label.toLowerCase()
                        ).length;
                        return { label: req.label, count, required: req.minCount };
                      });
                  }
                }
              } catch { /* ignore */ }
            }

            // Fallback to rank-level classRequirement
            if (classRequirements.length === 0 && nextRank.classRequirement) {
              classRequirements = [{
                label: "Classes",
                count: styleAttendances.length,
                required: nextRank.classRequirement,
              }];
            }

            const allMet = classRequirements.length === 0 || classRequirements.every((r) => r.count >= r.required);
            if (allMet) {
              eligibleForPromotion.push({
                memberId: member.id,
                memberName: `${member.firstName} ${member.lastName}`,
                styleName: ms.name,
                currentRank: sortedRanks[currentIdx].name,
                nextRank: nextRank.name,
                requirementsMet: classRequirements,
              });
            }
          }

          if (eligibleForPromotion.length >= 10) break;
        }
      }
    } catch (err) {
      console.error("Promotion eligibility check error:", err);
    }

    // --- Low Stock Items ---
    const allPosItems = await prisma.pOSItem.findMany({
      where: { isActive: true, clientId },
      select: {
        id: true,
        name: true,
        quantity: true,
        reorderThreshold: true,
        variants: { select: { quantity: true } },
      },
    });
    const lowStockItems = allPosItems.filter(item => {
      const stock = item.variants.length > 0
        ? item.variants.reduce((sum, v) => sum + v.quantity, 0)
        : item.quantity;
      const threshold = item.reorderThreshold ?? 5;
      return stock > 0 && stock <= threshold;
    }).map(item => ({
      id: item.id,
      name: item.name,
      stock: item.variants.length > 0
        ? item.variants.reduce((sum, v) => sum + v.quantity, 0)
        : item.quantity,
      threshold: item.reorderThreshold ?? 5,
    }));

    // --- Active Trial Passes ---
    const activeTrials = await prisma.trialPass.findMany({
      where: { status: "ACTIVE", member: { clientId } },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: 10,
    });

    const trialsData = activeTrials.map((t) => ({
      id: t.id,
      memberId: t.member.id,
      memberName: `${t.member.firstName} ${t.member.lastName}`,
      classesUsed: t.classesUsed,
      maxClasses: t.maxClasses,
      expiresAt: t.expiresAt.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((t.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    }));

    return NextResponse.json({
      members: {
        total: totalMembers,
        active: activeMembers,
        prospects: prospectMembers,
        recent: recentMembers,
      },
      classesToday,
      attendance: {
        todayCount: todayAttendanceCount,
        recentCheckins,
      },
      tasks: {
        open: openTasks,
        overdueCount: overdueTasks,
      },
      revenue: {
        todayPosCents: todayPosRevenue,
        todayTransactionCount: todayTransactions.length,
        monthPosCents: monthTransactions._sum.totalCents || 0,
        monthTransactionCount: monthTransactions._count,
        monthlyRecurringRevenue,
        activeMembershipCount: activeMemberships.length,
      },
      billing: {
        pastDueCount,
        upcomingBillings,
        pastDueInvoices,
      },
      appointments: todaysAppointments,
      expiringMemberships,
      lowStockItems,
      eligibleForPromotion,
      activeTrials: trialsData,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return new NextResponse("Failed to load dashboard", { status: 500 });
  }
}
